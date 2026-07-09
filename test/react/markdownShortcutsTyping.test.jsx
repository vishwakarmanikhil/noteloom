import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
  };
}

function typeChar(editable, char) {
  const hostSpans = editable.querySelectorAll('[data-run-id]');
  const host = hostSpans[hostSpans.length - 1];
  const textNode = host.firstChild;
  textNode.data = (textNode.data ?? '') + char;
  fireEvent.input(editable);
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

describe('markdown shortcuts: real keystroke-by-keystroke typing converts a plain paragraph', () => {
  it('typing "- " character by character converts the paragraph into a bulleted list item', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const editable = container.querySelector('[contenteditable]');

    typeChar(editable, '-');
    expect(store.getBlock('p1').type).toBe('paragraph'); // not yet — trigger space hasn't landed

    typeChar(editable, ' ');
    expect(store.getBlock('p1')).toBeUndefined();
    const newId = store.getBlock('root').contentIds[0];
    expect(store.getBlock(newId).type).toBe('listItem');
    expect(store.getBlock(newId).props.ordered).toBe(false);
  });

  it('typing "1. " converts to an ordered list item and further typing lands in the new block', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const editable = container.querySelector('[contenteditable]');

    for (const char of '1. ') typeChar(editable, char);

    const newId = store.getBlock('root').contentIds[0];
    const newBlock = store.getBlock(newId);
    expect(newBlock.type).toBe('listItem');
    expect(newBlock.props.ordered).toBe(true);

    // Further typing continues into the converted block's (reused) run —
    // the whole point of carrying runIds over instead of starting fresh.
    const runId = newBlock.props.titleRunIds[0];
    const editableAfter = container.querySelector('[contenteditable]');
    typeChar(editableAfter, 'x');
    expect(store.getRun(runId).value).toBe('x');
  });

  it('typing "# " converts to a heading', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const editable = container.querySelector('[contenteditable]');

    for (const char of '# ') typeChar(editable, char);

    const newId = store.getBlock('root').contentIds[0];
    expect(store.getBlock(newId).type).toBe('heading');
    expect(store.getBlock(newId).props.level).toBe(1);
  });
});
