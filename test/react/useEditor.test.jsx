import { describe, it, expect } from 'vitest';
import { render, fireEvent, renderHook } from '@testing-library/react';
import { useEditor } from '../../src/react/useEditor.js';
import { NoteloomEditor } from '../../src/react/NoteloomEditor.jsx';
import { History } from '../../src/store/history.js';
import { EditorStore } from '../../src/store/EditorStore.js';

describe('useEditor', () => {
  it('returns a History-wrapped store seeded with one empty paragraph, and populated registries', () => {
    const { result } = renderHook(() => useEditor());
    const { store, registry, inlineRegistry } = result.current;

    expect(store).toBeInstanceOf(History);
    const rootId = store.getRootId();
    const root = store.getBlock(rootId);
    expect(root.contentIds).toHaveLength(1);
    const paragraph = store.getBlock(root.contentIds[0]);
    expect(paragraph.type).toBe('paragraph');

    expect(registry.get('paragraph')).toBeTruthy();
    expect(registry.get('heading')).toBeTruthy();
    expect(inlineRegistry.get('date')).toBeTruthy();
  });

  it('returns a plain EditorStore (no undo/redo) when history: false', () => {
    const { result } = renderHook(() => useEditor({ history: false }));
    expect(result.current.store).toBeInstanceOf(EditorStore);
    expect(result.current.store).not.toBeInstanceOf(History);
  });

  it('accepts a custom initial doc', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    };
    const { result } = renderHook(() => useEditor({ doc }));
    const root = result.current.store.getBlock('root');
    expect(root.contentIds).toEqual(['p1']);
  });

  it('memoizes the editor across re-renders (store identity is stable)', () => {
    const { result, rerender } = renderHook(() => useEditor());
    const first = result.current.store;
    rerender();
    expect(result.current.store).toBe(first);
  });
});

/** Types `text` into runNode and places a collapsed caret at its end, mimicking real browser typing (same helper as test/commands/slashMenu.test.jsx). */
function typeIntoRun(runNode, text) {
  runNode.textContent = text;
  const range = document.createRange();
  range.setStart(runNode.firstChild, text.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(runNode);
}

function Wrapper() {
  const editor = useEditor();
  return <NoteloomEditor editor={editor} />;
}

describe('NoteloomEditor', () => {
  it('renders a working editable document from just useEditor()', () => {
    const { container } = render(<Wrapper />);
    expect(container.querySelector('[role="document"]')).toBeTruthy();

    const runNode = container.querySelector('[data-run-id]');
    expect(runNode).toBeTruthy();

    typeIntoRun(runNode, 'hello world');
    expect(runNode.textContent).toBe('hello world');
  });

  it('opens the slash menu when "/" is typed at the start of a block', () => {
    const { container } = render(<Wrapper />);
    const runNode = container.querySelector('[data-run-id]');

    typeIntoRun(runNode, '/');

    const items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBeGreaterThan(1);
  });
});
