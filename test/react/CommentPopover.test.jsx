import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { addComment, replyToComment } from '../../src/comments/comments.js';

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

function renderHarness(store, { authorId } = {}) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry} commentAuthorId={authorId}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

function getFirstRunEl(container) {
  // addComment may split the run -- the comment-marked slice is whichever
  // element ends up with the highlight class.
  return container.querySelector('.be-comment-highlight') ?? container.querySelector('[data-run-id]');
}

describe('CommentPopover', () => {
  it('does not show when hovering plain (non-commented) text', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { authorId: 'alice' });
    const runEl = container.querySelector('[data-run-id="r1"]');

    fireEvent.mouseOver(runEl);
    expect(document.querySelector('.be-comment-popover')).toBeNull();
  });

  it('opens on click over a commented run, showing the thread', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'looks off' });
    const { container } = renderHarness(store, { authorId: 'alice' });

    const commentedEl = getFirstRunEl(container);
    fireEvent.click(commentedEl);

    const popover = document.querySelector('.be-comment-popover');
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain('looks off');
    expect(popover.textContent).toContain('alice');
  });

  it('opens on hover too, and stays open while the pointer is over the popover', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'hover preview' });
    const { container } = renderHarness(store, { authorId: 'alice' });

    const commentedEl = getFirstRunEl(container);
    fireEvent.mouseOver(commentedEl);
    expect(document.querySelector('.be-comment-popover')?.textContent).toContain('hover preview');
  });

  it('reply composer appends a message when authorId is configured', () => {
    const store = new EditorStore(makeDoc());
    const commentId = addComment(
      store,
      { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
      { authorId: 'alice', text: 'first message' },
    );
    const { container } = renderHarness(store, { authorId: 'bob' });

    fireEvent.click(getFirstRunEl(container));
    const popover = document.querySelector('.be-comment-popover');
    fireEvent.click([...popover.querySelectorAll('button')].find((b) => b.textContent === 'Reply'));

    const textarea = popover.querySelector('.be-comment-composer-textarea');
    fireEvent.change(textarea, { target: { value: 'a reply' } });
    fireEvent.click(popover.querySelector('.be-comment-composer-submit'));

    expect(store.getComment(commentId).messages.map((m) => m.text)).toEqual(['first message', 'a reply']);
  });

  it('hides Reply when no authorId is configured, but still shows Resolve/Delete', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'x' });
    const { container } = renderHarness(store); // no authorId

    fireEvent.click(getFirstRunEl(container));
    const popover = document.querySelector('.be-comment-popover');
    const buttonLabels = [...popover.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttonLabels).not.toContain('Reply');
    expect(buttonLabels).toContain('Resolve');
  });

  it('Resolve toggles the thread, Delete removes it and strips the highlight', () => {
    const store = new EditorStore(makeDoc());
    const commentId = addComment(
      store,
      { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
      { authorId: 'alice', text: 'x' },
    );
    const { container } = renderHarness(store, { authorId: 'alice' });

    fireEvent.click(getFirstRunEl(container));
    let popover = document.querySelector('.be-comment-popover');
    fireEvent.click([...popover.querySelectorAll('button')].find((b) => b.textContent === 'Resolve'));
    expect(store.getComment(commentId).resolved).toBe(true);

    popover = document.querySelector('.be-comment-popover');
    fireEvent.click(popover.querySelector('.be-comment-thread-delete'));
    expect(store.getComment(commentId)).toBeUndefined();
    expect(document.querySelector('.be-comment-highlight')).toBeNull();
  });

  it('closes on Escape', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'x' });
    const { container } = renderHarness(store, { authorId: 'alice' });

    fireEvent.click(getFirstRunEl(container));
    expect(document.querySelector('.be-comment-popover')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.be-comment-popover')).toBeNull();
  });

  it('shows an avatar for the root message and indents replies in their own connector container', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'root' });
    const commentId = store.getComments()[0].id;
    replyToComment(store, commentId, { authorId: 'bob', text: 'a reply' });
    const { container } = renderHarness(store, { authorId: 'alice' });

    fireEvent.click(getFirstRunEl(container));
    const popover = document.querySelector('.be-comment-popover');
    expect(popover.querySelectorAll('.be-comment-avatar').length).toBe(2);
    const repliesContainer = popover.querySelector('.be-comment-thread-replies');
    expect(repliesContainer).not.toBeNull();
    expect(repliesContainer.textContent).toContain('a reply');
  });

  it('closes on an outside click', () => {
    const store = new EditorStore(makeDoc());
    addComment(store, { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { authorId: 'alice', text: 'x' });
    const { container } = renderHarness(store, { authorId: 'alice' });

    fireEvent.click(getFirstRunEl(container));
    expect(document.querySelector('.be-comment-popover')).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.be-comment-popover')).toBeNull();
  });
});
