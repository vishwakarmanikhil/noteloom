import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider, useEditorStore } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { MobileActionBar } from '../../src/react/MobileActionBar.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createTableBlock } from '../../src/blocks/table/createTableBlock.js';
import { createCalloutBlock } from '../../src/blocks/callout/createCalloutBlock.js';
import { insertBlock } from '../../src/store/operations.js';

function makeMatchMedia(matches) {
  return () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} });
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function baseDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
  };
}

function insertAtRoot(store, factory, index) {
  const { block, runs = [], subtreeBlocks = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block, ...subtreeBlocks], runs }));
  return block.id;
}

function Harness() {
  const containerRef = useRef(null);
  const store = useEditorStore();
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
      <MobileActionBar containerRef={containerRef} store={store} />
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

function focusRun(runNode) {
  act(() => {
    runNode.focus();
    fireEvent.focusIn(runNode);
  });
}

function collapseCaret(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

function selectWithinRunNode(runNode, start, end) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, start);
  range.setEnd(runNode.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

describe('MobileActionBar: visibility', () => {
  it('renders nothing on a fine (mouse) pointer', () => {
    window.matchMedia = makeMatchMedia(false);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    focusRun(runNode);
    collapseCaret(runNode, 3);

    expect(container.querySelector('.be-mobile-action-bar')).toBeNull();
  });

  it('renders nothing on a coarse pointer until focus is inside the editor', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);

    expect(container.querySelector('.be-mobile-action-bar')).toBeNull();
  });

  it('appears once focus moves inside the editor on a coarse pointer', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    focusRun(runNode);
    collapseCaret(runNode, 3);

    expect(container.querySelector('.be-mobile-action-bar')).not.toBeNull();
  });
});

describe('MobileActionBar: collapsed caret in a plain block', () => {
  it('shows Add block plus Undo/Redo, not formatting buttons', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    focusRun(runNode);
    collapseCaret(runNode, 3);

    expect(container.querySelector('[aria-label="Add block"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Bold"]')).toBeNull();
  });
});

describe('MobileActionBar: real text selection', () => {
  it('shows formatting actions, and Bold applies through the same store mutation as FloatingToolbar', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    focusRun(runNode);
    selectWithinRunNode(runNode, 0, 5); // "hello"

    const boldBtn = container.querySelector('[aria-label="Bold"]');
    expect(boldBtn).not.toBeNull();
    fireEvent.click(boldBtn);

    const runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(runs.find((r) => r.value === 'hello').marks.bold).toBe(true);
  });
});

describe('MobileActionBar: context-aware quick actions', () => {
  it('shows row/column insert actions when the caret is in a table cell', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }), 1);
    const { container } = renderHarness(store);

    const cellRunNode = container.querySelector('.be-table-cell [data-run-id]');
    focusRun(cellRunNode);
    collapseCaret(cellRunNode, 0);

    expect(container.querySelector('[aria-label="Insert row below"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Insert column right"]')).not.toBeNull();
  });

  it('shows the language select when the caret is in a code block', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['c1'], props: {} },
        { id: 'c1', type: 'code', parentId: 'root', contentIds: ['r-c1'], props: { language: 'javascript' } },
      ],
      runs: [{ id: 'r-c1', type: 'text', value: 'const x = 1;', marks: {} }],
    });
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r-c1"]');

    focusRun(runNode);
    collapseCaret(runNode, 0);

    expect(container.querySelector('.be-mobile-bar-select')).not.toBeNull();
  });

  it('shows the color swatches when the caret is in a callout', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    insertAtRoot(store, createCalloutBlock(), 1);
    const { container } = renderHarness(store);

    const calloutRunNode = container.querySelector('.be-callout [data-run-id]');
    focusRun(calloutRunNode);
    collapseCaret(calloutRunNode, 0);

    expect(container.querySelector('.be-mobile-bar-swatches')).not.toBeNull();
  });
});

describe('MobileActionBar: Add block sheet', () => {
  it('tapping "+" then a command inserts a block at the resolved caret position', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    focusRun(runNode);
    collapseCaret(runNode, 3);

    fireEvent.click(container.querySelector('[aria-label="Add block"]'));
    const dividerOption = [...document.querySelectorAll('.be-mobile-picker-item')].find((el) =>
      el.textContent.includes('Divider'),
    );
    expect(dividerOption).toBeDefined();
    fireEvent.click(dividerOption);

    // Divider's own run() seeds a trailing empty paragraph after itself too
    // (see src/blocks/divider/index.js) — root ends up p1, divider, new p.
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(3);
    const types = rootIds.map((id) => store.getBlock(id).type);
    expect(types).toEqual(['paragraph', 'divider', 'paragraph']);
  });
});

describe('MobileActionBar: Block options sheet (the moved-off-the-gutter menu)', () => {
  it('duplicates the TOP-LEVEL block the caret is in, even from inside a nested table cell', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }), 1);
    const { container } = renderHarness(store);
    const cellRunNode = container.querySelector('.be-table-cell [data-run-id]');
    const tableId = store.getBlock('root').contentIds[1];

    focusRun(cellRunNode);
    collapseCaret(cellRunNode, 0);

    fireEvent.click(container.querySelector('[aria-label="Block options"]'));
    fireEvent.click([...document.querySelectorAll('.be-mobile-picker-item')].find((el) => el.textContent.includes('Duplicate')));

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(3); // p1, original table, duplicated table
    expect(store.getBlock(rootIds[2]).type).toBe('table');
    expect(rootIds[2]).not.toBe(tableId);
  });

  it('deletes the block and closes the sheet', () => {
    window.matchMedia = makeMatchMedia(true);
    const store = new EditorStore(baseDoc());
    insertAtRoot(store, createCalloutBlock(), 1);
    const { container } = renderHarness(store);
    const calloutRunNode = container.querySelector('.be-callout [data-run-id]');

    focusRun(calloutRunNode);
    collapseCaret(calloutRunNode, 0);

    fireEvent.click(container.querySelector('[aria-label="Block options"]'));
    expect(container.ownerDocument.querySelector('.be-modal-sheet')).not.toBeNull();
    fireEvent.click([...document.querySelectorAll('.be-mobile-picker-item')].find((el) => el.textContent.includes('Delete')));

    expect(store.getBlock('root').contentIds).toEqual(['p1']);
    expect(document.querySelector('.be-modal-sheet')).toBeNull();
  });
});
