import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider, useWholeDocumentSelection } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useEditorKeyboardShortcuts } from '../../src/react/useEditorKeyboardShortcuts.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
  };
}

function Harness() {
  const containerRef = useRef(null);
  useEditorKeyboardShortcuts(containerRef);
  const [isWholeDocumentSelected] = useWholeDocumentSelection();
  return (
    <div ref={containerRef}>
      <div data-testid="whole-doc-selected">{String(isWholeDocumentSelected)}</div>
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

function selectWithinRunNode(runNode, start, end) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAcrossRunNodes(startRunNode, startOffset, endRunNode, endOffset) {
  const range = document.createRange();
  range.setStart(startRunNode.firstChild, startOffset);
  range.setEnd(endRunNode.firstChild, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('useEditorKeyboardShortcuts: undo/redo', () => {
  it('Ctrl+Z undoes and Ctrl+Shift+Z redoes the last edit', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);

    act(() => {
      store.applyOperation({ type: 'updateRun', id: 'r1', patch: { value: 'hello world!' } });
    });
    expect(store.getRun('r1').value).toBe('hello world!');

    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true });
    expect(store.getRun('r1').value).toBe('hello world');

    fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(store.getRun('r1').value).toBe('hello world!');
  });

  it('is a no-op on a plain EditorStore (no History)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    // should not throw even though store.undo is undefined
    expect(() => fireEvent.keyDown(runNode, { key: 'z', ctrlKey: true })).not.toThrow();
  });
});

describe('useEditorKeyboardShortcuts: mark toggling', () => {
  it('Ctrl+B toggles bold on the selected text within one run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 6, 11); // "world"
    fireEvent.keyDown(runNode, { key: 'b', ctrlKey: true });

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(2);
    expect(store.getRun(contentIds[0]).value).toBe('hello ');
    expect(store.getRun(contentIds[1]).value).toBe('world');
    expect(store.getRun(contentIds[1]).marks.bold).toBe(true);
  });

  it('Ctrl+I toggles italic across a selection spanning two separate runs', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'hello ', marks: {} },
        { id: 'r2', type: 'text', value: 'world', marks: {} },
      ],
    });
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 2, r2Node, 3); // "llo " + "wor"
    fireEvent.keyDown(r1Node, { key: 'i', ctrlKey: true });

    const runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(runs.map((r) => r.value).join('')).toBe('hello world');
    expect(runs.find((r) => r.value === 'llo ').marks.italic).toBe(true);
    expect(runs.find((r) => r.value === 'wor').marks.italic).toBe(true);
    expect(runs.find((r) => r.value === 'ld').marks.italic).toBeUndefined();
  });

  it('Ctrl+B toggles bold across a selection spanning two sibling blocks', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first line', marks: {} },
        { id: 'r2', type: 'text', value: 'second line', marks: {} },
      ],
    });
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 6, r2Node, 6); // "line" (end of p1) through "second" (start of p2)
    fireEvent.keyDown(r1Node, { key: 'b', ctrlKey: true });

    const p1Runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(p1Runs.find((r) => r.value === 'first ').marks.bold).toBeUndefined();
    expect(p1Runs.find((r) => r.value === 'line').marks.bold).toBe(true);

    const p2Runs = store.getBlock('p2').contentIds.map((id) => store.getRun(id));
    expect(p2Runs.find((r) => r.value === 'second').marks.bold).toBe(true);
    expect(p2Runs.find((r) => r.value === ' line').marks.bold).toBeUndefined();
  });
});

describe('useEditorKeyboardShortcuts: select-all (two-stage Ctrl+A)', () => {
  it('first Ctrl+A press is left to native browser behavior (not intercepted)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    // Caret collapsed, nothing selected yet: our handler must not
    // preventDefault, so native Ctrl+A can select the current block itself.
    const event = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => runNode.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  });

  it('second Ctrl+A press (whole current block already selected) promotes to whole-document-selected', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
      ],
    });
    const { container, getByTestId } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(r1Node, 0, 'first'.length); // whole first block already selected
    expect(getByTestId('whole-doc-selected').textContent).toBe('false');

    const event = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => r1Node.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId('whole-doc-selected').textContent).toBe('true');
  });

  it('second Ctrl+A press still promotes when the block was created empty and then typed into (regression: leftover placeholder byte)', () => {
    // A block that started empty gets a zero-width-space placeholder so the
    // browser has a real caret anchor (see domRunSync.js). Once real text is
    // typed, TextRunSpan deliberately leaves that placeholder byte sitting
    // in the DOM (to avoid resetting the caret every keystroke) even though
    // the store's run.value is clean — so the run's *actual* text node here
    // is "​first", one character longer than run.value ("first").
    // Native select-all's raw DOM offset must be translated back down to
    // run.value's length, or this comparison silently fails forever for any
    // block typed into after being created empty (slash-menu blocks,
    // Enter-split blocks, etc.) — exactly the reported bug.
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
      ],
    });
    const { container, getByTestId } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    r1Node.textContent = '​first';
    const containerEl = r1Node.parentElement; // the shared contentEditable region

    // Native Ctrl+A anchors at the container level, addressing the whole
    // run as one child (see resolveContainerLevelSelection).
    const range = document.createRange();
    range.setStart(containerEl, 0);
    range.setEnd(containerEl, containerEl.childNodes.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    expect(getByTestId('whole-doc-selected').textContent).toBe('false');

    const event = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => r1Node.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId('whole-doc-selected').textContent).toBe('true');
  });

  it('Ctrl+A on an empty block (e.g. freshly created from the slash menu) promotes straight to whole-document-selected', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'heading', parentId: 'root', contentIds: ['r2'], props: { level: 2 } },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: '', marks: {} },
      ],
    });
    const { container, getByTestId } = renderHarness(store);
    const r2Node = container.querySelector('[data-run-id="r2"]');

    // collapsed caret inside the empty run's placeholder text node — an
    // empty block can never produce a non-collapsed selection, which is
    // exactly why isEntireBlockSelected alone can't detect it.
    selectWithinRunNode(r2Node, 0, 0);
    expect(getByTestId('whole-doc-selected').textContent).toBe('false');

    const event = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => r2Node.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId('whole-doc-selected').textContent).toBe('true');
  });

  it('Backspace while whole-document-selected clears the document down to one blank paragraph', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
      ],
    });
    const store = new History(rawStore);
    const { container, getByTestId } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(r1Node, 0, 'first'.length);
    act(() => r1Node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(getByTestId('whole-doc-selected').textContent).toBe('true');

    act(() => r1Node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })));

    expect(getByTestId('whole-doc-selected').textContent).toBe('false');
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    const survivor = store.getBlock(rootIds[0]);
    expect(survivor.type).toBe('paragraph');
    expect(store.getRun(survivor.contentIds[0]).value).toBe('');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('first');
    expect(store.getRun('r2').value).toBe('second');
  });
});

describe('useEditorKeyboardShortcuts: cross-block Backspace/Delete', () => {
  it('Backspace over a selection spanning two sibling blocks deletes and merges them, one atomic undo step', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first line', marks: {} },
        { id: 'r2', type: 'text', value: 'second line', marks: {} },
      ],
    });
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 6, r2Node, 6); // "line" (end of p1) through "second" (start of p2)
    const event = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    act(() => r1Node.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['p1']);
    const mergedText = store
      .getBlock('p1')
      .contentIds.map((id) => store.getRun(id).value)
      .join('');
    expect(mergedText).toBe('first  line');

    store.undo();
    const rootIdsAfterUndo = store.getBlock('root').contentIds;
    expect(rootIdsAfterUndo).toEqual(['p1', 'p2']);
    expect(store.getRun(store.getBlock('p1').contentIds[0]).value).toBe('first line');
    expect(store.getRun(store.getBlock('p2').contentIds[0]).value).toBe('second line');
  });

  it('plain Backspace within one block (no cross-block selection) is left untouched by the global handler', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5); // "hello" within the same run — same-block, not cross-block
    const event = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    act(() => runNode.dispatchEvent(event));

    // the global cross-block handler must not intervene here; it's left to
    // EditableBlockContent's own per-block handling / native typing
    expect(event.defaultPrevented).toBe(false);
    expect(store.getRun('r1').value).toBe('hello world'); // untouched by the global handler
  });
});
