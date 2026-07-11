import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { exportDocumentJSON, exportDocumentHTML, exportDocumentText } from '../../src/clipboard/exportDocument.js';

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

    const rebuilt = new EditorStore({ rootId: parsed.rootId, blocks: parsed.blocks, runs: parsed.runs });
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
