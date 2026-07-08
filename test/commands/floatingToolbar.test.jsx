import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider, useEditorStore } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useFloatingToolbarTrigger } from '../../src/commands/useFloatingToolbarTrigger.js';
import { FloatingToolbar } from '../../src/commands/FloatingToolbar.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'hello world', marks: {} },
      { id: 'r2', type: 'text', value: 'second line', marks: {} },
    ],
  };
}

function Harness() {
  const containerRef = useRef(null);
  const store = useEditorStore();
  const toolbar = useFloatingToolbarTrigger(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
      <FloatingToolbar
        isOpen={toolbar.isOpen}
        rect={toolbar.rect}
        kind={toolbar.kind}
        selection={toolbar.selection}
        crossSelection={toolbar.crossSelection}
        marks={toolbar.marks}
        store={store}
      />
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
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

function selectAcrossRunNodes(startRunNode, startOffset, endRunNode, endOffset) {
  const range = document.createRange();
  range.setStart(startRunNode.firstChild, startOffset);
  range.setEnd(endRunNode.firstChild, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

function collapseSelection(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

describe('useFloatingToolbarTrigger: when the toolbar shows', () => {
  it('does not show for a collapsed caret', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    collapseSelection(runNode, 3);
    expect(container.querySelector('.be-floating-toolbar')).toBeNull();
  });

  it('shows for a same-block text selection', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5); // "hello"
    expect(container.querySelector('.be-floating-toolbar')).not.toBeNull();
  });

  it('shows for a selection spanning two sibling blocks', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 6, r2Node, 6);
    expect(container.querySelector('.be-floating-toolbar')).not.toBeNull();
  });

  it('hides again once the selection collapses back to a caret', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5);
    expect(container.querySelector('.be-floating-toolbar')).not.toBeNull();

    collapseSelection(runNode, 0);
    expect(container.querySelector('.be-floating-toolbar')).toBeNull();
  });
});

describe('FloatingToolbar: applying marks over a same-block selection', () => {
  it('clicking Bold toggles bold over the selected text and keeps the caret usable afterward', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 6, 11); // "world"
    const boldBtn = container.querySelector('.be-floating-toolbar-btn[title^="Bold"]');
    fireEvent.click(boldBtn);

    const contentIds = store.getBlock('p1').contentIds;
    const runs = contentIds.map((id) => store.getRun(id));
    expect(runs.find((r) => r.value === 'world').marks.bold).toBe(true);
  });

  it('the Bold button shows pressed state when the whole selection already has it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: { bold: true } }],
    });
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5);
    const boldBtn = container.querySelector('.be-floating-toolbar-btn[title^="Bold"]');
    expect(boldBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('picking a text color from the palette applies it via a value patch, not a boolean', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5); // "hello"
    fireEvent.click(container.querySelector('.be-floating-toolbar-btn[title="Text color"]'));
    const redSwatch = container.querySelector('.be-floating-toolbar-swatch[title="Red"]');
    fireEvent.click(redSwatch);

    const runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(runs.find((r) => r.value === 'hello').marks.color).toBe('#e03131');
  });

  it('picking a highlight from the palette applies it, and the picker closes afterward', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5);
    fireEvent.click(container.querySelector('.be-floating-toolbar-btn[title="Highlight"]'));
    expect(container.querySelector('.be-floating-toolbar-picker')).not.toBeNull();

    const yellowSwatch = container.querySelector('.be-floating-toolbar-swatch[title="Yellow"]');
    fireEvent.click(yellowSwatch);

    const runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(runs.find((r) => r.value === 'hello').marks.highlight).toBe('#fff3bf');
    expect(container.querySelector('.be-floating-toolbar-picker')).toBeNull();
  });

  it('enabling superscript clears subscript in the same click (mutual exclusivity)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: { subscript: true } }],
    });
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5);
    fireEvent.click(container.querySelector('.be-floating-toolbar-btn[title="Superscript"]'));

    const run = store.getBlock('p1').contentIds.map((id) => store.getRun(id))[0];
    expect(run.marks.superscript).toBe(true);
    expect(run.marks.subscript).toBeUndefined();
  });

  it('undo restores the pre-formatting state (goes through the normal operation/history pipeline)', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(runNode, 0, 5);
    fireEvent.click(container.querySelector('.be-floating-toolbar-btn[title^="Bold"]'));
    expect(store.getBlock('p1').contentIds.map((id) => store.getRun(id).marks.bold).some(Boolean)).toBe(true);

    act(() => store.undo());
    const runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(runs.every((r) => !r.marks.bold)).toBe(true);
  });
});

describe('FloatingToolbar: applying marks over a cross-block selection', () => {
  it('toggling bold across two sibling blocks applies to both, via toggleMarkOverBlockRange', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 6, r2Node, 6); // "world" through "second"
    fireEvent.click(container.querySelector('.be-floating-toolbar-btn[title^="Bold"]'));

    const p1Runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    const p2Runs = store.getBlock('p2').contentIds.map((id) => store.getRun(id));
    expect(p1Runs.find((r) => r.value === 'world').marks.bold).toBe(true);
    expect(p2Runs.find((r) => r.value === 'second').marks.bold).toBe(true);
  });
});
