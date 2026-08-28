import { describe, it, expect } from 'vitest';
import { render, fireEvent, renderHook } from '@testing-library/react';
import { useEditor } from '../../src/react/useEditor.js';
import { NoteloomEditor } from '../../src/react/NoteloomEditor.jsx';
import { History } from '../../src/store/history.js';
import { EditorStore } from '../../src/store/EditorStore.js';
import { addComment } from '../../src/comments/comments.js';
import { starterKit } from '../../src/starter-kit.js';
import { defineBlock } from '../../src/registry/define.js';

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

  it('accepts a custom initial doc (internal shape)', () => {
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

  it('accepts a custom initial doc in the simple format too (auto-detected)', () => {
    const doc = {
      version: 1,
      blocks: [
        { id: 'h1', type: 'heading', data: { text: 'Hi', level: 2 } },
        { id: 'p1', type: 'paragraph', data: { text: 'hello <strong>world</strong>' } },
      ],
    };
    const { result } = renderHook(() => useEditor({ doc }));
    const { store } = result.current;
    const top = store.getBlock(store.getRootId()).contentIds.map((id) => store.getBlock(id).type);
    expect(top).toEqual(['heading', 'paragraph']);
  });

  it('editor.toJSON() returns the simple format by default, internal on request', () => {
    const doc = {
      version: 1,
      blocks: [{ id: 'p1', type: 'paragraph', data: { text: 'hi' } }],
    };
    const { result } = renderHook(() => useEditor({ doc }));
    const editor = result.current;

    const simple = editor.toJSON();
    expect(simple.version).toBe(1);
    expect(Array.isArray(simple.blocks)).toBe(true);
    expect(simple.rootId).toBeUndefined();

    const internal = editor.toJSON({ format: 'internal' });
    expect(typeof internal.rootId).toBe('string');
    expect(Array.isArray(internal.runs)).toBe(true);
  });

  it('memoizes the editor across re-renders (store identity is stable)', () => {
    const { result, rerender } = renderHook(() => useEditor());
    const first = result.current.store;
    rerender();
    expect(result.current.store).toBe(first);
  });

  it('extensions: starterKit() registers the same types as the default (no-arg) path', () => {
    const def = renderHook(() => useEditor()).result.current;
    const kit = renderHook(() => useEditor({ extensions: starterKit() })).result.current;

    const blockTypes = (r) => [...r._types.keys()].sort();
    expect(blockTypes(kit.registry)).toEqual(blockTypes(def.registry));
    expect(blockTypes(kit.inlineRegistry)).toEqual(blockTypes(def.inlineRegistry));
  });

  it('extensions replaces the built-ins (opt-in), and a registerBlocks callback still runs on top', () => {
    const rating = defineBlock({ name: 'rating', component: () => null, contentModel: 'void' });
    const { result } = renderHook(() =>
      useEditor({
        extensions: [rating],
        registerBlocks: (registry) => registry.register('extra', { component: () => null }),
      }),
    );
    const { registry } = result.current;
    expect([...registry._types.keys()].sort()).toEqual(['extra', 'rating']);
    expect(registry.get('paragraph')).toBeUndefined(); // built-ins suppressed
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

  it('forwards className/style/getBlockClassName to EditorProvider', () => {
    function StyledWrapper() {
      const editor = useEditor();
      return (
        <NoteloomEditor
          editor={editor}
          className="my-editor"
          style={{ '--noteloom-accent': '#16a34a' }}
          getBlockClassName={(block) => (block.type === 'paragraph' ? 'my-paragraph' : undefined)}
        />
      );
    }
    const { container } = render(<StyledWrapper />);

    const root = container.querySelector('.my-editor');
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue('--noteloom-accent')).toBe('#16a34a');
    expect(container.querySelector('.be-paragraph.my-paragraph')).toBeTruthy();
  });

  it('does not render CommentsPanel by default', () => {
    const { container } = render(<Wrapper />);
    expect(container.querySelector('.be-comments-panel')).toBeNull();
  });

  it('renders CommentsPanel (with its actual content) when showCommentsPanel is true and a comment exists', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
    };
    function PanelWrapper() {
      const editor = useEditor({ doc });
      addComment(
        editor.store,
        { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
        { authorId: 'alice', text: 'a comment' },
      );
      return <NoteloomEditor editor={editor} showCommentsPanel commentAuthorId="alice" />;
    }
    const { container, getByText } = render(<PanelWrapper />);
    expect(container.querySelector('.be-comments-panel')).toBeTruthy();
    expect(getByText('a comment')).toBeTruthy();
  });

  it('the floating toolbar gets commentAuthorId (built-in composer path) when NoteloomEditor is given it', () => {
    function CommentWrapper() {
      const editor = useEditor();
      return <NoteloomEditor editor={editor} commentAuthorId="alice" />;
    }
    const { container } = render(<CommentWrapper />);
    const runNode = container.querySelector('[data-run-id]');
    typeIntoRun(runNode, 'hello world');

    const range = document.createRange();
    range.setStart(runNode.firstChild, 0);
    range.setEnd(runNode.firstChild, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));

    const commentBtn = container.querySelector('.be-floating-toolbar-btn[title^="Comment"]');
    expect(commentBtn).toBeTruthy();
  });
});
