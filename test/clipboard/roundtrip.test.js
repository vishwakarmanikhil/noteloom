import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { serializeBlockRange } from '../../src/clipboard/serialize.js';
import { deserializeClipboard } from '../../src/clipboard/deserialize.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';
import { APP_MIME } from '../../src/clipboard/mimeType.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r-h1'], props: { level: 2 } },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
    ],
    runs: [
      { id: 'r-h1', type: 'text', value: 'Diagnosis', marks: {} },
      { id: 'r-p1', type: 'text', value: 'hello world', marks: {} },
    ],
  };
}

function makeRegistry() {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return registry;
}

class FakeDataTransfer {
  constructor(data) {
    this._data = data;
    this.types = Object.keys(data);
  }
  getData(type) {
    return this._data[type] ?? '';
  }
}

describe('clipboard: copy -> external HTML -> paste (cross-editor path)', () => {
  it('serializes heading+paragraph to HTML and plain text', () => {
    const store = new EditorStore(makeDoc());
    const registry = makeRegistry();

    const { html, text } = serializeBlockRange(store, registry, ['h1', 'p1']);
    expect(html).toBe('<h2>Diagnosis</h2><p>hello world</p>');
    expect(text).toBe('Diagnosis\nhello world');
  });

  it('parses external HTML back into the correct block types via the registry (no APP_MIME present)', () => {
    const registry = makeRegistry();
    const dt = new FakeDataTransfer({
      'text/html': '<h3>Notes</h3><p>from <strong>another</strong> editor</p>',
      'text/plain': 'Notes\nfrom another editor',
    });

    const inserts = deserializeClipboard(dt, registry);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].block.type).toBe('heading');
    expect(inserts[0].block.props.level).toBe(3);
    expect(inserts[0].runs[0].value).toBe('Notes');

    expect(inserts[1].block.type).toBe('paragraph');
    // "from " + bold("another") + " editor" -> 3 runs, middle one bold
    expect(inserts[1].runs.map((r) => r.value).join('')).toBe('from another editor');
    expect(inserts[1].runs.find((r) => r.value === 'another').marks.bold).toBe(true);
  });

  it('falls back to plain-text paragraphs when no HTML is present', () => {
    const registry = makeRegistry();
    const dt = new FakeDataTransfer({ 'text/plain': 'line one\nline two' });
    const inserts = deserializeClipboard(dt, registry);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((i) => i.block.type === 'paragraph')).toBe(true);
    expect(inserts.map((i) => i.runs[0].value)).toEqual(['line one', 'line two']);
  });

  it('walkDomToBlocks groups <li> into nested listItem blocks with ordered flag', () => {
    const registry = makeRegistry();
    const inserts = walkDomToBlocks('<ul><li>first</li><li>second</li></ul>', registry);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].block.type).toBe('listItem');
    expect(inserts[0].block.props.ordered).toBe(false);
    expect(inserts[0].runs[0].value).toBe('first');
  });
});

describe('clipboard: copy -> same-editor APP_MIME -> paste (lossless path)', () => {
  it('round-trips a subtree exactly and regenerates ids to avoid collisions', () => {
    const store = new EditorStore(makeDoc());
    const registry = makeRegistry();

    const { json } = serializeBlockRange(store, registry, ['p1']);
    const dt = new FakeDataTransfer({ [APP_MIME]: json, 'text/html': '<p>hello world</p>', 'text/plain': 'hello world' });

    const inserts = deserializeClipboard(dt, registry);
    expect(inserts).toHaveLength(1);
    const { block, runs } = inserts[0];
    expect(block.type).toBe('paragraph');
    expect(block.id).not.toBe('p1'); // id regenerated, not colliding with source
    expect(runs[0].value).toBe('hello world');
    expect(block.contentIds).toEqual([runs[0].id]); // ids remapped consistently
  });

  it('prefers APP_MIME over text/html when both are present', () => {
    const store = new EditorStore(makeDoc());
    const registry = makeRegistry();
    const { json } = serializeBlockRange(store, registry, ['h1']);

    const dt = new FakeDataTransfer({
      [APP_MIME]: json,
      // deliberately different/wrong HTML to prove APP_MIME wins
      'text/html': '<p>should not be used</p>',
    });

    const inserts = deserializeClipboard(dt, registry);
    expect(inserts[0].block.type).toBe('heading');
    expect(inserts[0].runs[0].value).toBe('Diagnosis');
  });
});

describe('clipboard: list-item grouping on copy', () => {
  it('wraps consecutive listItem blocks of the same ordering in one <ul>/<ol>', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
        { id: 'li2', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r2'] } },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one', marks: {} },
        { id: 'r2', type: 'text', value: 'two', marks: {} },
      ],
    });
    const registry = makeRegistry();

    const { html } = serializeBlockRange(store, registry, ['li1', 'li2']);
    expect(html).toBe('<ul><li>one</li><li>two</li></ul>');
  });
});
