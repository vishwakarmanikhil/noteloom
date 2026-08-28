import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useEditor } from '../../src/react/useEditor.js';
import { NoteloomEditor } from '../../src/react/NoteloomEditor.jsx';
import { starterKit } from '../../src/starter-kit.js';
import { defineExtension } from '../../src/registry/define.js';
import { matchesKeymap } from '../../src/react/useExtensionBehaviors.js';
import { smartQuotes, autoPairBrackets } from '../../src/extensions/typing.js';

function docWith(text) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: text, marks: {} }],
  };
}

/** Collapsed caret at `offset` inside the given run's text node. */
function placeCaret(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

describe('matchesKeymap', () => {
  const ev = (over) => ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    key: 'k',
    ...over,
  });

  it('matches Mod / Shift / Alt combos exactly', () => {
    expect(matchesKeymap(ev({ ctrlKey: true }), 'Mod-k')).toBe(true);
    expect(matchesKeymap(ev({ metaKey: true }), 'Mod-k')).toBe(true);
    expect(matchesKeymap(ev({ ctrlKey: true, shiftKey: true }), 'Mod-Shift-k')).toBe(true);
    expect(matchesKeymap(ev({ ctrlKey: true }), 'Mod-Shift-k')).toBe(false); // shift missing
    expect(matchesKeymap(ev({}), 'Mod-k')).toBe(false); // mod missing
    expect(matchesKeymap(ev({ key: 'Enter' }), 'Enter')).toBe(true);
  });
});

describe('useExtensionBehaviors (via <NoteloomEditor>)', () => {
  it('is inert with no behavior extensions (a keymap-free editor still works)', () => {
    function W() {
      return <NoteloomEditor editor={useEditor()} />;
    }
    const { container } = render(<W />);
    expect(container.querySelector('[role="document"]')).toBeTruthy();
  });

  it('runs an extension keymap handler and marks the key handled', () => {
    const handler = vi.fn(() => true);
    function W() {
      const editor = useEditor({
        extensions: [
          ...starterKit(),
          defineExtension({ name: 't', keymap: { 'Mod-Shift-k': handler } }),
        ],
      });
      return <NoteloomEditor editor={editor} />;
    }
    const { container } = render(<W />);
    const surface = container.querySelector('[role="document"]');

    const handled = fireEvent.keyDown(surface, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handled).toBe(false); // preventDefault() was called

    fireEvent.keyDown(surface, { key: 'k', ctrlKey: true }); // no shift -> no match
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs setup(ctx) on mount and its cleanup on unmount', () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    function W() {
      const editor = useEditor({
        extensions: [...starterKit(), defineExtension({ name: 's', setup })],
      });
      return <NoteloomEditor editor={editor} />;
    }
    const { unmount } = render(<W />);
    expect(setup).toHaveBeenCalledTimes(1);
    const ctx = setup.mock.calls[0][0];
    expect(typeof ctx.applyOperation).toBe('function');
    expect(typeof ctx.getRootId()).toBe('string');

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('smartQuotes(): a straight quote typed at the caret becomes a curly quote', () => {
    let editor;
    function W() {
      editor = useEditor({ doc: docWith('word'), extensions: [...starterKit(), smartQuotes()] });
      return <NoteloomEditor editor={editor} />;
    }
    const { container } = render(<W />);
    const runNode = container.querySelector('[data-run-id="r1"]');
    placeCaret(runNode, 4); // after "word"

    fireEvent(
      runNode,
      new window.InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '"',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(editor.store.getRun('r1').value).toBe('word”'); // ” (closing curly, since a letter precedes)
  });

  it('autoPairBrackets(): typing "(" inserts the matching closer', () => {
    let editor;
    function W() {
      editor = useEditor({ doc: docWith('fn'), extensions: [...starterKit(), autoPairBrackets()] });
      return <NoteloomEditor editor={editor} />;
    }
    const { container } = render(<W />);
    const runNode = container.querySelector('[data-run-id="r1"]');
    placeCaret(runNode, 2);

    fireEvent(
      runNode,
      new window.InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '(',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(editor.store.getRun('r1').value).toBe('fn()');
  });
});
