import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useEditorKeyboardShortcuts } from '../../src/react/useEditorKeyboardShortcuts.js';
import { insertBlock, removeBlock } from '../../src/store/operations.js';

// Regression coverage: undo/redo always restored the *data* correctly, but
// never moved the caret back to where the edit actually happened — every
// other mutating shortcut in useEditorKeyboardShortcuts.js calls
// focusRunAtOffset/focusRunEnd afterward, undo/redo didn't. Mocking
// focusRun.js (same technique as indentFocus.test.js) sidesteps the
// rAF-based real DOM focus entirely and just asserts History (by way of
// restoreSelectionAfterHistoryChange) handed the right target to focus.
vi.mock('../../src/react/focusRun.js', () => ({
  focusRunEnd: vi.fn(),
  focusRunAtOffset: vi.fn(),
}));
import { focusRunEnd, focusRunAtOffset } from '../../src/react/focusRun.js';

function twoParagraphDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'hello', marks: {} },
      { id: 'r2', type: 'text', value: 'world', marks: {} },
    ],
  };
}

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
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

describe('undo/redo restores the caret to where the edit happened, not just the data', () => {
  beforeEach(() => {
    focusRunEnd.mockClear();
    focusRunAtOffset.mockClear();
  });

  it('Ctrl+Z after an append moves the caret back to the end of the pre-edit text', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    store.applyOperation({ type: 'updateRun', id: 'r1', patch: { value: 'hello!' } });
    expect(store.getRun('r1').value).toBe('hello!');

    focusRunAtOffset.mockClear();
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });

    expect(store.getRun('r1').value).toBe('hello');
    expect(focusRunAtOffset).toHaveBeenCalledTimes(1);
    expect(focusRunAtOffset).toHaveBeenCalledWith('r1', 5); // end of "hello", where the caret was before typing "!"
  });

  it('Ctrl+Shift+Z (redo) moves the caret to the end of the re-applied text', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    store.applyOperation({ type: 'updateRun', id: 'r1', patch: { value: 'hello!' } });
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });
    expect(store.getRun('r1').value).toBe('hello');

    focusRunAtOffset.mockClear();
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true, shiftKey: true });

    expect(store.getRun('r1').value).toBe('hello!');
    expect(focusRunAtOffset).toHaveBeenCalledTimes(1);
    expect(focusRunAtOffset).toHaveBeenCalledWith('r1', 6); // end of "hello!"
  });

  it('undoing a mid-text edit restores the caret to where it actually was, not the end of the run', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    // "hello" -> "helXlo": inserted "X" at offset 3, not at the end.
    store.applyOperation({ type: 'updateRun', id: 'r1', patch: { value: 'helXlo' } });

    focusRunAtOffset.mockClear();
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });

    expect(store.getRun('r1').value).toBe('hello');
    expect(focusRunAtOffset).toHaveBeenCalledWith('r1', 3); // where the caret was right before typing "X"
  });

  it('undoing a block delete (structural, no clean run+offset) refocuses the restored block itself, not wherever focus happened to be', () => {
    const rawStore = new EditorStore(twoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    store.applyOperation(removeBlock('p2'));
    expect(store.getBlock('p2')).toBeUndefined();

    focusRunEnd.mockClear();
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });

    expect(store.getBlock('p2')).toBeDefined(); // restored
    // No precise run+offset for a structural op, but the fallback still
    // lands focus inside the block the undo actually restored (p2's own
    // run), not left dangling on whatever had focus before Ctrl+Z.
    expect(focusRunEnd).toHaveBeenCalledWith('r2');
    expect(focusRunAtOffset).not.toHaveBeenCalled();
  });

  it('redoing that same delete moves focus to the remaining content, since the deleted block no longer exists to hold it', () => {
    const rawStore = new EditorStore(twoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    store.applyOperation(removeBlock('p2'));
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true }); // undo: p2 restored

    focusRunEnd.mockClear();
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true, shiftKey: true }); // redo: p2 deleted again

    expect(store.getBlock('p2')).toBeUndefined();
    expect(focusRunEnd).toHaveBeenCalledWith('r1'); // falls back to the remaining sibling's content
  });

  it('undoing a block insert (structural) falls back to the remaining content once the inserted block is gone again', () => {
    const rawStore = new EditorStore(twoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    store.performBatch([
      insertBlock({ id: 'p3', type: 'paragraph', parentId: 'root', contentIds: [], props: {} }, 'root', 2),
    ]);

    focusRunEnd.mockClear();
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });

    expect(store.getBlock('p3')).toBeUndefined();
    expect(focusRunEnd).toHaveBeenCalled(); // lands somewhere real, not left dangling
    expect(focusRunAtOffset).not.toHaveBeenCalled();
  });

  it('Ctrl+Z is still a no-op on a plain EditorStore (no History) — does not throw', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    expect(() => fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true })).not.toThrow();
    expect(focusRunAtOffset).not.toHaveBeenCalled();
  });
});
