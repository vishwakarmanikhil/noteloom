import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useEditorKeyboardShortcuts } from '../../src/react/useEditorKeyboardShortcuts.js';

function makeDocWithDivider() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'div1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'div1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'before', marks: {} },
      { id: 'r2', type: 'text', value: 'after', marks: {} },
    ],
  };
}

function makeDocWithEmbed() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'embed1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'embed1', type: 'embed', parentId: 'root', contentIds: [], props: { kind: 'image', src: 'https://x/a.png' } },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'before', marks: {} },
      { id: 'r2', type: 'text', value: 'after', marks: {} },
    ],
  };
}

function Harness() {
  const containerRef = useRef(null);
  useEditorKeyboardShortcuts(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
    </div>
  );
}

function renderHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <Harness />
    </EditorProvider>,
  );
}

function collapseCaretAt(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('non-editable block select-then-delete: Backspace into a preceding divider', () => {
  it('the first Backspace only highlights the divider — nothing is deleted, caret/text in the current block is untouched', () => {
    const store = new EditorStore(makeDocWithDivider());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 0); // caret at the very start of p2

    fireEvent.keyDown(runNode, { key: 'Backspace' });

    expect(store.getBlock('div1')).toBeDefined(); // not deleted yet
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'div1', 'p2']);
    expect(container.querySelector('[data-block-id="div1"]').classList.contains('be-block-selected')).toBe(true);
    expect(store.getRun('r2').value).toBe('after'); // p2's own text untouched
  });

  it('a second Backspace while it is highlighted actually removes it, and the caret was never moved out of p2', () => {
    const rawStore = new EditorStore(makeDocWithDivider());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' }); // select
    fireEvent.keyDown(runNode, { key: 'Backspace' }); // delete

    expect(store.getBlock('div1')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(container.querySelector('.be-block-selected')).toBeNull();
    // p2 itself was never removed/remounted/merged — still there with its own text
    expect(store.getBlock('p2')).toBeDefined();
    expect(store.getRun('r2').value).toBe('after');
  });

  it('undo restores the removed divider', () => {
    const rawStore = new EditorStore(makeDocWithDivider());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' });
    fireEvent.keyDown(runNode, { key: 'Backspace' });
    expect(store.getBlock('div1')).toBeUndefined();

    act(() => store.undo());
    expect(store.getBlock('div1')).toBeDefined();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'div1', 'p2']);
  });

  it('pressing any other key (e.g. typing) clears the highlight without deleting anything', () => {
    const store = new EditorStore(makeDocWithDivider());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' }); // select
    expect(container.querySelector('.be-block-selected')).not.toBeNull();

    fireEvent.keyDown(runNode, { key: 'a' }); // unrelated key
    expect(container.querySelector('.be-block-selected')).toBeNull();
    expect(store.getBlock('div1')).toBeDefined(); // still there
  });

  it('clicking elsewhere (mousedown) clears the highlight without deleting anything', () => {
    const store = new EditorStore(makeDocWithDivider());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' });
    expect(container.querySelector('.be-block-selected')).not.toBeNull();

    fireEvent.mouseDown(container.querySelector('[data-run-id="r1"]'));
    expect(container.querySelector('.be-block-selected')).toBeNull();
    expect(store.getBlock('div1')).toBeDefined();
  });

  it('Backspace with the caret NOT at the start of the block does nothing to the divider', () => {
    const store = new EditorStore(makeDocWithDivider());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r2"]');
    collapseCaretAt(runNode, 2); // mid-text, not at start

    fireEvent.keyDown(runNode, { key: 'Backspace' });

    expect(container.querySelector('.be-block-selected')).toBeNull();
    expect(store.getBlock('div1')).toBeDefined();
  });
});

describe('non-editable block select-then-delete: generalizes to every block type via EditableBlockContent, not just paragraph', () => {
  it('also works when the block after the divider is a list item title, not a paragraph', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['div1', 'li1'], props: {} },
        { id: 'div1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'item text', marks: {} }],
    });
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' }); // select
    expect(container.querySelector('[data-block-id="div1"]').classList.contains('be-block-selected')).toBe(true);
    expect(store.getBlock('div1')).toBeDefined();

    fireEvent.keyDown(runNode, { key: 'Backspace' }); // delete
    expect(store.getBlock('div1')).toBeUndefined();
    expect(store.getBlock('li1')).toBeDefined(); // the list item itself untouched
    expect(store.getRun('r1').value).toBe('item text');
  });
});

describe('regression: an empty block next to a divider must be removed BEFORE the divider is ever highlighted', () => {
  function makeDocWithEmptyParagraphBeforeDivider() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['div1', 'p1'], props: {} },
        { id: 'div1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    };
  }

  it('first Backspace on the empty paragraph removes the paragraph itself, not the divider — and selects the divider for a possible second press', () => {
    const store = new EditorStore(makeDocWithEmptyParagraphBeforeDivider());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' });

    expect(store.getBlock('p1')).toBeUndefined(); // the empty paragraph is gone
    expect(store.getBlock('div1')).toBeDefined(); // the divider is untouched
    expect(store.getBlock('root').contentIds).toEqual(['div1']);
    expect(container.querySelector('[data-block-id="div1"]').classList.contains('be-block-selected')).toBe(true);
  });

  it('a second Backspace (landing directly on the now-selected divider) then removes the divider', () => {
    const rawStore = new EditorStore(makeDocWithEmptyParagraphBeforeDivider());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 0);

    fireEvent.keyDown(runNode, { key: 'Backspace' }); // removes p1, selects div1
    const divNode = container.querySelector('[data-block-id="div1"]');
    fireEvent.keyDown(divNode, { key: 'Backspace' }); // lands directly on div1

    expect(store.getBlock('div1')).toBeUndefined();
    expect(container.querySelector('.be-block-selected')).toBeNull();
    // ensureRootNonEmpty must have backfilled a blank paragraph rather than
    // leaving a genuinely empty document.
    expect(store.getBlock('root').contentIds).toHaveLength(1);
  });
});

describe('non-editable block select-then-delete: Delete key into a following embed', () => {
  it('the first Delete at the end of a block only highlights the following embed', () => {
    const store = new EditorStore(makeDocWithEmbed());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 'before'.length); // caret at the very end of p1

    fireEvent.keyDown(runNode, { key: 'Delete' });

    expect(store.getBlock('embed1')).toBeDefined();
    expect(container.querySelector('[data-block-id="embed1"]').classList.contains('be-block-selected')).toBe(true);
  });

  it('a second Delete removes the embed, leaving the current block\'s caret position untouched', () => {
    const store = new EditorStore(makeDocWithEmbed());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 'before'.length);

    fireEvent.keyDown(runNode, { key: 'Delete' });
    fireEvent.keyDown(runNode, { key: 'Delete' });

    expect(store.getBlock('embed1')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('before'); // p1's own text untouched throughout
  });

  it('Delete with the caret not at the end of the block does nothing to the embed', () => {
    const store = new EditorStore(makeDocWithEmbed());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    collapseCaretAt(runNode, 0); // start, not end

    fireEvent.keyDown(runNode, { key: 'Delete' });

    expect(container.querySelector('.be-block-selected')).toBeNull();
    expect(store.getBlock('embed1')).toBeDefined();
  });
});
