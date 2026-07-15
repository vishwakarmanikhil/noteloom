import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { exportDocumentSimpleJSON, importDocumentSimpleJSON } from '../../src/clipboard/simpleFormat.js';

function makeRegistry() {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return registry;
}

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

function roundTrip(doc) {
  const registry = makeRegistry();
  const inlineRegistry = makeInlineRegistry();
  const store = new EditorStore(doc);

  const json = exportDocumentSimpleJSON(store, registry, inlineRegistry);
  const parsed = JSON.parse(json);
  const importedDoc = importDocumentSimpleJSON(parsed, registry, inlineRegistry);
  const importedStore = new EditorStore(importedDoc);

  return { store, parsed, importedStore, registry, inlineRegistry };
}

describe('exportDocumentSimpleJSON: shape', () => {
  it('produces a flat array of self-contained blocks with a version tag', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    };
    const { parsed } = roundTrip(doc);

    expect(parsed.version).toBe(1);
    expect(parsed.blocks).toEqual([{ id: 'p1', type: 'paragraph', data: { text: 'hello' } }]);
  });

  it('marks (bold/italic/link/color) are inlined as HTML in data.text', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'bold', marks: { bold: true } },
        { id: 'r2', type: 'text', value: ' link', marks: { link: { href: 'https://example.com' } } },
      ],
    };
    const { parsed } = roundTrip(doc);
    expect(parsed.blocks[0].data.text).toBe('<strong>bold</strong><a href="https://example.com"> link</a>');
  });
});

describe('exportDocumentSimpleJSON / importDocumentSimpleJSON: round-trip per block type', () => {
  it('paragraph and heading', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh'], props: { level: 3 } },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp'], props: {} },
      ],
      runs: [
        { id: 'rh', type: 'text', value: 'Key features', marks: {} },
        { id: 'rp', type: 'text', value: 'hello world', marks: {} },
      ],
    };
    const { importedStore } = roundTrip(doc);
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const [h1, p1] = rootIds.map((id) => importedStore.getBlock(id));

    expect(h1.type).toBe('heading');
    expect(h1.props.level).toBe(3);
    expect(importedStore.getRun(h1.contentIds[0]).value).toBe('Key features');
    expect(p1.type).toBe('paragraph');
    expect(importedStore.getRun(p1.contentIds[0]).value).toBe('hello world');
  });

  it('nested listItem (bulleted, numbered, to-do) with children', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: ['li2'], props: { ordered: false, titleRunIds: ['r1'] } },
        { id: 'li2', type: 'listItem', parentId: 'li1', contentIds: [], props: { ordered: false, checked: true, titleRunIds: ['r2'] } },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Parent item', marks: {} },
        { id: 'r2', type: 'text', value: 'Done sub-task', marks: {} },
      ],
    };
    const { parsed, importedStore } = roundTrip(doc);

    expect(parsed.blocks[0]).toMatchObject({
      type: 'listItem',
      data: { text: 'Parent item', ordered: false },
    });
    expect(parsed.blocks[0].children[0]).toMatchObject({
      type: 'listItem',
      data: { text: 'Done sub-task', ordered: false, checked: true },
    });

    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const parent = importedStore.getBlock(rootIds[0]);
    expect(importedStore.getRun(parent.props.titleRunIds[0]).value).toBe('Parent item');
    const child = importedStore.getBlock(parent.contentIds[0]);
    expect(child.props.checked).toBe(true);
    expect(importedStore.getRun(child.props.titleRunIds[0]).value).toBe('Done sub-task');
  });

  it('toggleHeading with a paragraph child', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['tg1'], props: {} },
        { id: 'tg1', type: 'toggleHeading', parentId: 'root', contentIds: ['p1'], props: { level: 2, collapsed: false, titleRunIds: ['r1'] } },
        { id: 'p1', type: 'paragraph', parentId: 'tg1', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'A section', marks: {} },
        { id: 'r2', type: 'text', value: 'Hidden content', marks: {} },
      ],
    };
    const { importedStore } = roundTrip(doc);
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const toggle = importedStore.getBlock(rootIds[0]);

    expect(toggle.props.level).toBe(2);
    expect(importedStore.getRun(toggle.props.titleRunIds[0]).value).toBe('A section');
    const child = importedStore.getBlock(toggle.contentIds[0]);
    expect(child.type).toBe('paragraph');
    expect(importedStore.getRun(child.contentIds[0]).value).toBe('Hidden content');
  });

  it('callout with a paragraph child', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'callout', parentId: 'root', contentIds: ['p1'], props: { icon: '💡' } },
        { id: 'p1', type: 'paragraph', parentId: 'c1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'A tip', marks: {} }],
    };
    const { parsed, importedStore } = roundTrip(doc);

    expect(parsed.blocks[0]).toMatchObject({ type: 'callout', data: { icon: '💡' } });
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const callout = importedStore.getBlock(rootIds[0]);
    expect(callout.props.icon).toBe('💡');
    expect(importedStore.getRun(importedStore.getBlock(callout.contentIds[0]).contentIds[0]).value).toBe('A tip');
  });

  it('layout with columns', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['lay1'], props: {} },
        { id: 'lay1', type: 'layout', parentId: 'root', contentIds: ['col1', 'col2'], props: {} },
        { id: 'col1', type: 'layoutColumn', parentId: 'lay1', contentIds: ['p1'], props: {} },
        { id: 'col2', type: 'layoutColumn', parentId: 'lay1', contentIds: ['p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'col1', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'col2', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Column 1', marks: {} },
        { id: 'r2', type: 'text', value: 'Column 2', marks: {} },
      ],
    };
    const { importedStore } = roundTrip(doc);
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const layout = importedStore.getBlock(rootIds[0]);
    expect(layout.contentIds.length).toBe(2);
    const col1 = importedStore.getBlock(layout.contentIds[0]);
    expect(col1.type).toBe('layoutColumn');
    const p1 = importedStore.getBlock(col1.contentIds[0]);
    expect(importedStore.getRun(p1.contentIds[0]).value).toBe('Column 1');
  });

  it('table (columns + rows flattened, no tableRow/tableCell exposed)', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['t1'], props: {} },
        { id: 't1', type: 'table', parentId: 'root', contentIds: ['row1'], props: { columns: [{ id: 'c1', label: 'Name', type: 'text', width: 160 }] } },
        { id: 'row1', type: 'tableRow', parentId: 't1', contentIds: ['cell1'], props: {} },
        { id: 'cell1', type: 'tableCell', parentId: 'row1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'Alice', marks: {} }],
    };
    const { parsed, importedStore } = roundTrip(doc);

    expect(parsed.blocks[0].type).toBe('table');
    expect(parsed.blocks[0].children).toBeUndefined(); // flattened, not exposed as nested blocks
    expect(parsed.blocks[0].data.columns[0].label).toBe('Name');
    expect(parsed.blocks[0].data.rows).toEqual([['Alice']]);

    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const table = importedStore.getBlock(rootIds[0]);
    expect(table.props.columns[0].label).toBe('Name');
    const row = importedStore.getBlock(table.contentIds[0]);
    const cell = importedStore.getBlock(row.contentIds[0]);
    expect(importedStore.getRun(cell.contentIds[0]).value).toBe('Alice');
  });

  it('embed, button, code, blockquote, divider', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['e1', 'b1', 'cd1', 'bq1', 'd1'], props: {} },
        { id: 'e1', type: 'embed', parentId: 'root', contentIds: [], props: { kind: 'image', src: 'img.png', name: '', alt: 'A photo', mimeType: 'image/png', align: 'center', width: 80 } },
        { id: 'b1', type: 'button', parentId: 'root', contentIds: ['rb'], props: { href: 'https://example.com', color: '#ff0000', customAttrs: [{ key: 'tracking', value: 'x' }] } },
        { id: 'cd1', type: 'code', parentId: 'root', contentIds: ['rc'], props: { language: 'javascript' } },
        { id: 'bq1', type: 'blockquote', parentId: 'root', contentIds: ['rq'], props: {} },
        { id: 'd1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
      ],
      runs: [
        { id: 'rb', type: 'text', value: 'Click me', marks: {} },
        { id: 'rc', type: 'text', value: 'const x = 1;', marks: {} },
        { id: 'rq', type: 'text', value: 'A quote', marks: {} },
      ],
    };
    const { parsed, importedStore } = roundTrip(doc);

    expect(parsed.blocks.find((b) => b.type === 'embed').data).toMatchObject({
      kind: 'image',
      src: 'img.png',
      alt: 'A photo',
      align: 'center',
      width: 80,
    });

    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const [embed, button, code, blockquote, divider] = rootIds.map((id) => importedStore.getBlock(id));

    expect(embed.props.src).toBe('img.png');
    expect(embed.props.alt).toBe('A photo');
    expect(button.props.href).toBe('https://example.com');
    expect(button.props.customAttrs).toEqual([{ key: 'tracking', value: 'x' }]);
    expect(importedStore.getRun(button.contentIds[0]).value).toBe('Click me');
    expect(code.props.language).toBe('javascript');
    expect(importedStore.getRun(code.contentIds[0]).value).toBe('const x = 1;');
    expect(importedStore.getRun(blockquote.contentIds[0]).value).toBe('A quote');
    expect(divider.type).toBe('divider');
    expect(divider.contentIds).toEqual([]);
  });
});

describe('exportDocumentSimpleJSON / importDocumentSimpleJSON: atomic inline round-trip', () => {
  it('checkbox, date, and select runs mixed into one paragraph round-trip their core values (not their options list)', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'chk', 'r2', 'dt', 'r3', 'sel'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Done: ', marks: {} },
        { id: 'chk', type: 'checkbox', value: '', marks: {}, data: { checked: true, label: 'Confirmed' } },
        { id: 'r2', type: 'text', value: ' on ', marks: {} },
        { id: 'dt', type: 'date', value: '', marks: {}, data: { isoDate: '2026-07-15' } },
        { id: 'r3', type: 'text', value: ' status ', marks: {} },
        {
          id: 'sel',
          type: 'select',
          value: '',
          marks: {},
          data: { options: [{ value: 'ok', label: 'OK' }], selectedValue: 'ok', placeholder: '' },
        },
      ],
    };
    const { importedStore } = roundTrip(doc);
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    const p1 = importedStore.getBlock(rootIds[0]);
    const runs = p1.contentIds.map((id) => importedStore.getRun(id));

    const checkbox = runs.find((r) => r.type === 'checkbox');
    expect(checkbox.data.checked).toBe(true);
    expect(checkbox.data.label).toBe('Confirmed');

    const date = runs.find((r) => r.type === 'date');
    expect(date.data.isoDate).toBe('2026-07-15');

    const select = runs.find((r) => r.type === 'select');
    expect(select.data.selectedValue).toBe('ok');
    // Known, by-design limitation (same as clipboard paste): the full
    // options list is not part of an inline type's toHTML/fromHTML output,
    // so it does not survive the round-trip — only the selected value/label do.
    expect(select.data.options).toEqual([]);
  });
});

describe('exportDocumentSimpleJSON / importDocumentSimpleJSON: ids are preserved', () => {
  it('keeps the same block id across both export and import — useful for CRUD/referencing a specific block from an external system', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['my-para'], props: {} },
        { id: 'my-para', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hi', marks: {} }],
    };
    const { parsed, importedStore } = roundTrip(doc);

    expect(parsed.blocks[0].id).toBe('my-para');
    const rootIds = importedStore.getBlock(importedStore.getRootId()).contentIds;
    expect(rootIds).toEqual(['my-para']);
  });

  it('mints a fresh id on import when a block in the simple JSON has none', () => {
    const registry = makeRegistry();
    const inlineRegistry = makeInlineRegistry();
    const json = { version: 1, blocks: [{ type: 'paragraph', data: { text: 'no id here' } }] };

    const imported = importDocumentSimpleJSON(json, registry, inlineRegistry);
    expect(imported.blocks.find((b) => b.type === 'paragraph').id).toBeTruthy();
  });
});
