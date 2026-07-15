import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useCaretRect } from '../../src/react/useCaretRect.js';

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

function selectCollapsedAt(runNode, offset) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

function selectAllTextInRun(runNode) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.length);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

let lastRect;
function Harness() {
  const [isActive, setIsActive] = useState(false);
  lastRect = useCaretRect(isActive);
  return (
    <div>
      <button type="button" onClick={() => setIsActive((v) => !v)}>
        toggle
      </button>
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

describe('useCaretRect', () => {
  it('returns null while inactive, even with a real collapsed caret in an editable run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);

    expect(lastRect).toBeNull();
  });

  it('returns a rect once active, for a collapsed caret inside an editable run', () => {
    const store = new EditorStore(makeDoc());
    const { container, getByText } = renderHarness(store);

    fireActivate(getByText);
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);

    expect(lastRect).not.toBeNull();
    expect(lastRect).toHaveProperty('top');
    expect(lastRect).toHaveProperty('left');
  });

  it('returns null when the selection is not collapsed', () => {
    const store = new EditorStore(makeDoc());
    const { container, getByText } = renderHarness(store);

    fireActivate(getByText);
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectAllTextInRun(runNode);

    expect(lastRect).toBeNull();
  });

  it('returns null when there is no selection inside any editable run', () => {
    const store = new EditorStore(makeDoc());
    const { getByText } = renderHarness(store);

    fireActivate(getByText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    act(() => document.dispatchEvent(new Event('selectionchange')));

    expect(lastRect).toBeNull();
  });

  it('recomputes to null the moment it goes inactive again', () => {
    const store = new EditorStore(makeDoc());
    const { container, getByText } = renderHarness(store);

    fireActivate(getByText);
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);
    expect(lastRect).not.toBeNull();

    fireActivate(getByText); // toggle back off
    expect(lastRect).toBeNull();
  });
});

function fireActivate(getByText) {
  act(() => getByText('toggle').click());
}
