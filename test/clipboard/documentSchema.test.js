import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import {
  exportDocumentSimpleJSON,
  importDocumentSimpleJSON,
} from '../../src/clipboard/simpleFormat.js';

const schema = JSON.parse(
  readFileSync(resolve(process.cwd(), 'docs/document.schema.json'), 'utf8'),
);
const validate = new Ajv({ allErrors: true }).compile(schema);

function registries() {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return { registry, inlineRegistry };
}

// A document touching several block types, marks, nesting, and a table.
const INTERNAL_DOC = {
  rootId: 'root',
  blocks: [
    {
      id: 'root',
      type: 'page',
      parentId: null,
      contentIds: ['h', 'p', 'ca', 'li', 't'],
      props: {},
    },
    { id: 'h', type: 'heading', parentId: 'root', contentIds: ['rh'], props: { level: 2 } },
    { id: 'p', type: 'paragraph', parentId: 'root', contentIds: ['rp1', 'rp2'], props: {} },
    { id: 'ca', type: 'callout', parentId: 'root', contentIds: ['cap'], props: { icon: '💡' } },
    { id: 'cap', type: 'paragraph', parentId: 'ca', contentIds: ['rcap'], props: {} },
    {
      id: 'li',
      type: 'listItem',
      parentId: 'root',
      contentIds: ['li2'],
      props: { ordered: false, titleRunIds: ['rli'] },
    },
    {
      id: 'li2',
      type: 'listItem',
      parentId: 'li',
      contentIds: [],
      props: { ordered: false, titleRunIds: ['rli2'] },
    },
    {
      id: 't',
      type: 'table',
      parentId: 'root',
      contentIds: ['tr'],
      props: { columns: [{ id: 'c1', label: 'A', type: 'text', width: 120 }] },
    },
    { id: 'tr', type: 'tableRow', parentId: 't', contentIds: ['tc'], props: {} },
    { id: 'tc', type: 'tableCell', parentId: 'tr', contentIds: ['rtc'], props: {} },
  ],
  runs: [
    { id: 'rh', type: 'text', value: 'Title', marks: {} },
    { id: 'rp1', type: 'text', value: 'bold', marks: { bold: true } },
    { id: 'rp2', type: 'text', value: ' plain', marks: {} },
    { id: 'rcap', type: 'text', value: 'note', marks: {} },
    { id: 'rli', type: 'text', value: 'parent', marks: {} },
    { id: 'rli2', type: 'text', value: 'child', marks: {} },
    { id: 'rtc', type: 'text', value: 'cell', marks: {} },
  ],
};

describe('document.schema.json', () => {
  it('exportDocumentSimpleJSON output validates against the published schema', () => {
    const { registry, inlineRegistry } = registries();
    const store = new EditorStore(INTERNAL_DOC);
    const out = JSON.parse(exportDocumentSimpleJSON(store, registry, inlineRegistry));

    const ok = validate(out);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it('an empty document validates', () => {
    expect(validate({ version: 1, blocks: [] })).toBe(true);
  });

  it('rejects a wrong version and unknown top-level keys', () => {
    expect(validate({ version: 2, blocks: [] })).toBe(false);
    expect(validate({ version: 1, blocks: [], rootId: 'x' })).toBe(false);
  });
});

describe('simple format round-trip is stable (fromJSON(toJSON(x)) === toJSON(x))', () => {
  it('simple -> store -> simple is byte-identical', () => {
    const { registry, inlineRegistry } = registries();
    const once = exportDocumentSimpleJSON(new EditorStore(INTERNAL_DOC), registry, inlineRegistry);
    const reimported = importDocumentSimpleJSON(JSON.parse(once), registry, inlineRegistry);
    const twice = exportDocumentSimpleJSON(new EditorStore(reimported), registry, inlineRegistry);
    expect(twice).toBe(once);
  });
});
