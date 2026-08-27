import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import {
  exportDocumentJSON,
  exportDocumentHTML,
  exportDocumentText,
  exportDocumentMarkdown,
  exportDocumentWordHTML,
} from '../../src/clipboard/exportDocument.js';

function makeDoc() {
  return new EditorStore({
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r-h1'], props: { level: 2 } },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
    ],
    runs: [
      { id: 'r-h1', type: 'text', value: 'Title', marks: {} },
      { id: 'r-p1', type: 'text', value: 'Body text', marks: { bold: true } },
    ],
  });
}

describe('exportDocumentJSON', () => {
  it('round-trips into a shape new EditorStore(...) accepts directly', () => {
    const store = makeDoc();
    const json = exportDocumentJSON(store);
    const parsed = JSON.parse(json);

    expect(parsed.rootId).toBe('root');
    expect(parsed.blocks.map((b) => b.id).sort()).toEqual(['h1', 'p1', 'root'].sort());
    expect(parsed.runs.map((r) => r.value)).toEqual(expect.arrayContaining(['Title', 'Body text']));

    const rebuilt = new EditorStore({
      rootId: parsed.rootId,
      blocks: parsed.blocks,
      runs: parsed.runs,
    });
    expect(rebuilt.getBlock('h1').props.level).toBe(2);
    expect(rebuilt.getRun('r-p1').value).toBe('Body text');
  });

  it('pretty-prints by default, and can be compacted via { pretty: false }', () => {
    const store = makeDoc();
    expect(exportDocumentJSON(store)).toContain('\n');
    expect(exportDocumentJSON(store, { pretty: false })).not.toContain('\n');
  });
});

describe('exportDocumentHTML / exportDocumentText', () => {
  it('serializes every top-level block via the registry, in document order', () => {
    const store = makeDoc();
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = exportDocumentHTML(store, registry);
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>Body text</strong>');
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Body text'));

    const text = exportDocumentText(store, registry);
    expect(text).toBe('Title\nBody text');
  });

  it('returns an empty string for a document with nothing under root', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    expect(exportDocumentHTML(store, registry)).toBe('');
    expect(exportDocumentText(store, registry)).toBe('');
  });
});

describe('exportDocumentWordHTML', () => {
  it('wraps exportDocumentHTML output with the Word MSO namespace/xml block, so it opens directly when saved as .doc', () => {
    const store = makeDoc();
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const wordHtml = exportDocumentWordHTML(store, registry);
    expect(wordHtml).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(wordHtml).toContain('<!--[if gte mso 9]>');
    expect(wordHtml).toContain(exportDocumentHTML(store, registry));
  });
});

describe('exportDocumentMarkdown', () => {
  it('heading + paragraph with marks, separated by a blank line', () => {
    const store = makeDoc();
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const md = exportDocumentMarkdown(store, registry);
    expect(md).toBe('## Title\n\n**Body text**');
  });

  it('returns an empty string for a document with nothing under root', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    expect(exportDocumentMarkdown(store, registry)).toBe('');
  });

  it('consecutive list items of the same kind stay adjacent (no blank line); a different list kind starts fresh', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2', 'li3'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r1'] },
        },
        {
          id: 'li2',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r2'] },
        },
        {
          id: 'li3',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: true, titleRunIds: ['r3'] },
        },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
        { id: 'r3', type: 'text', value: 'third', marks: {} },
      ],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('- first\n- second\n\n1. third');
  });

  it('a nested list item is indented two spaces under its parent', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['li1a'],
          props: { ordered: false, titleRunIds: ['r1'] },
        },
        {
          id: 'li1a',
          type: 'listItem',
          parentId: 'li1',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r1a'] },
        },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'parent', marks: {} },
        { id: 'r1a', type: 'text', value: 'child', marks: {} },
      ],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('- parent\n  - child');
  });

  it('a to-do list item renders GFM task-list syntax', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, checked: true, titleRunIds: ['r1'] },
        },
        {
          id: 'li2',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, checked: false, titleRunIds: ['r2'] },
        },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'done', marks: {} },
        { id: 'r2', type: 'text', value: 'todo', marks: {} },
      ],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('- [x] done\n- [ ] todo');
  });

  it('consecutive blockquote lines stay adjacent as one quote', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['q1', 'q2'], props: {} },
        { id: 'q1', type: 'blockquote', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'q2', type: 'blockquote', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'line one', marks: {} },
        { id: 'r2', type: 'text', value: 'line two', marks: {} },
      ],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('> line one\n> line two');
  });

  it('a code block renders as a fenced block with its language', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r1'], props: { language: 'js' } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'const x = 1;', marks: {} }],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('```js\nconst x = 1;\n```');
  });

  it('a divider renders as ---', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['d1'], props: {} },
        { id: 'd1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
      ],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe('---');
  });

  it('a table renders as a GFM table with a header row and separator row', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        {
          id: 'root',
          type: 'page',
          parentId: null,
          contentIds: ['t1'],
          props: {},
        },
        {
          id: 't1',
          type: 'table',
          parentId: 'root',
          contentIds: ['row1'],
          props: {
            columns: [
              { id: 'c1', label: 'Name' },
              { id: 'c2', label: 'Qty' },
            ],
          },
        },
        { id: 'row1', type: 'tableRow', parentId: 't1', contentIds: ['cell1', 'cell2'], props: {} },
        { id: 'cell1', type: 'tableCell', parentId: 'row1', contentIds: ['r1'], props: {} },
        { id: 'cell2', type: 'tableCell', parentId: 'row1', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Apples', marks: {} },
        { id: 'r2', type: 'text', value: '3', marks: {} },
      ],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe(
      '| Name | Qty |\n| --- | --- |\n| Apples | 3 |',
    );
  });

  it('an image embed renders as ![alt](src); a file embed as a plain link', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['img1', 'file1'], props: {} },
        {
          id: 'img1',
          type: 'embed',
          parentId: 'root',
          contentIds: [],
          props: { kind: 'image', src: 'https://x/a.png', alt: 'a cat' },
        },
        {
          id: 'file1',
          type: 'embed',
          parentId: 'root',
          contentIds: [],
          props: { kind: 'file', src: 'https://x/a.pdf', name: 'a.pdf' },
        },
      ],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe(
      '![a cat](https://x/a.png)\n\n[a.pdf](https://x/a.pdf)',
    );
  });

  it('a block type with no toMarkdown of its own falls back to toPlainText', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['canvas1'], props: {} },
        { id: 'canvas1', type: 'canvas', parentId: 'root', contentIds: [], props: {} },
      ],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    expect(exportDocumentMarkdown(store, registry)).toBe(
      registry.get('canvas').toPlainText(store.getBlock('canvas1')),
    );
  });
});
