import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { serializeBlockRange } from '../../src/clipboard/serialize.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'q1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      { id: 'q1', type: 'blockquote', parentId: 'root', contentIds: ['r-q1'], props: {} },
    ],
    runs: [
      { id: 'r-p1', type: 'text', value: 'before', marks: {} },
      { id: 'r-q1', type: 'text', value: 'a quoted line', marks: {} },
    ],
  };
}

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('blockquote block: renders as a leaf (own runs, same mechanism as paragraph/heading)', () => {
  it('renders a <blockquote> with its own editable run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const bq = container.querySelector('[data-block-id="q1"]');
    expect(bq.tagName).toBe('BLOCKQUOTE');
    expect(bq.className).toBe('be-blockquote');
    expect(bq.textContent).toBe('a quoted line');
  });

  it('typing into it updates only that run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const runNode = container.querySelector('[data-run-id="r-q1"]');
    runNode.textContent = 'a quoted line!';
    fireEvent.input(runNode);

    expect(store.getRun('r-q1').value).toBe('a quoted line!');
  });

  it('shows the empty-quote placeholder only while empty and focused', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['q1'], props: {} },
        { id: 'q1', type: 'blockquote', parentId: 'root', contentIds: ['r-q1'], props: {} },
      ],
      runs: [{ id: 'r-q1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderDoc(store);
    const bq = container.querySelector('[data-block-id="q1"]');

    expect(bq.getAttribute('data-empty')).toBe('');
    expect(bq.getAttribute('data-placeholder')).toBe('Empty quote');
  });
});

describe('blockquote block: Enter exits into a plain paragraph, matching heading', () => {
  it('Enter inside a blockquote inserts a paragraph sibling, not another blockquote', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const runNode = container.querySelector('[data-run-id="r-q1"]');
    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootIds = store.getBlock('root').contentIds;
    const newBlockId = rootIds[rootIds.indexOf('q1') + 1];
    expect(store.getBlock(newBlockId).type).toBe('paragraph');
  });
});

describe('blockquote block: Backspace-at-start merges with an adjacent mergeable text type', () => {
  it('merges the quote text into a preceding paragraph and removes the quote shell', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);

    const prevId = mergeWithPreviousOrDelete(store, 'q1');

    expect(prevId).toBe('p1');
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['p1']); // q1 merged away
    const p1 = store.getBlock('p1');
    expect(p1.type).toBe('paragraph'); // merging into a paragraph keeps it a paragraph, not a quote
    expect(p1.contentIds.map((id) => store.getRun(id).value).join('')).toBe('beforea quoted line');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'q1']);
    expect(store.getRun('r-q1').value).toBe('a quoted line');
  });

  it('merging a paragraph into a preceding quote keeps it a quote (surviving block keeps its own type)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['q1', 'p1'], props: {} },
        { id: 'q1', type: 'blockquote', parentId: 'root', contentIds: ['r-q1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      ],
      runs: [
        { id: 'r-q1', type: 'text', value: 'quoted', marks: {} },
        { id: 'r-p1', type: 'text', value: ' plain', marks: {} },
      ],
    });

    const prevId = mergeWithPreviousOrDelete(store, 'p1');

    expect(prevId).toBe('q1');
    expect(store.getBlock('q1').type).toBe('blockquote');
    expect(store.getBlock('root').contentIds).toEqual(['q1']);
  });
});

describe('blockquote block: clipboard round-trip', () => {
  it('toHTML/serializeBlockRange groups consecutive quote lines into one <blockquote>', () => {
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

    const { html, text } = serializeBlockRange(store, registry, ['q1', 'q2']);
    expect(html).toBe('<blockquote><p>line one</p><p>line two</p></blockquote>');
    expect(text).toBe('line one\nline two');
  });

  it('a single quote does not get grouped with an adjacent paragraph', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { html } = serializeBlockRange(store, registry, ['p1', 'q1']);
    expect(html).toBe('<p>before</p><blockquote><p>a quoted line</p></blockquote>');
  });

  it('walkDomToBlocks expands a multi-line <blockquote> into one sibling blockquote block per <p>', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks('<blockquote><p>line one</p><p>line two</p></blockquote>', registry);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((i) => i.block.type === 'blockquote')).toBe(true);
    expect(inserts.map((i) => i.runs[0].value)).toEqual(['line one', 'line two']);
  });

  it('walkDomToBlocks treats a <blockquote> with no nested <p> as one single quote block', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks('<blockquote>just text</blockquote>', registry);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('blockquote');
    expect(inserts[0].runs[0].value).toBe('just text');
  });
});
