import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { CommentsPanel } from '../../src/react/CommentsPanel.jsx';
import { addComment } from '../../src/comments/comments.js';
import { resolveComment } from '../../src/store/operations.js';

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

const range = { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 };

function renderPanel(store, { authorId } = {}) {
  return render(
    <EditorProvider store={store} registry={{}}>
      <CommentsPanel authorId={authorId} />
    </EditorProvider>,
  );
}

describe('CommentsPanel', () => {
  it('renders nothing when there are no comments', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderPanel(store);
    expect(container.querySelector('.be-comments-panel')).toBeNull();
  });

  it('lists every thread in the document, unresolved first', () => {
    const store = new EditorStore(makeDoc());
    const idA = addComment(store, range, { authorId: 'alice', text: 'A: resolved' });
    const idB = addComment(store, range, { authorId: 'alice', text: 'B: unresolved' });
    store.applyOperation(resolveComment(idA, true));

    const { container } = renderPanel(store, { authorId: 'alice' });
    const texts = [...container.querySelectorAll('.be-comment-message-text')].map((el) => el.textContent);
    expect(texts).toEqual(['B: unresolved', 'A: resolved']);
  });

  it('reply/resolve/delete all work from the panel', () => {
    const store = new EditorStore(makeDoc());
    const id = addComment(store, range, { authorId: 'alice', text: 'first' });
    const { container, rerender } = renderPanel(store, { authorId: 'bob' });

    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Reply'));
    fireEvent.change(container.querySelector('.be-comment-composer-textarea'), { target: { value: 'a reply' } });
    fireEvent.click(container.querySelector('.be-comment-composer-submit'));
    expect(store.getComment(id).messages.map((m) => m.text)).toEqual(['first', 'a reply']);

    rerender(
      <EditorProvider store={store} registry={{}}>
        <CommentsPanel authorId="bob" />
      </EditorProvider>,
    );
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Resolve'));
    expect(store.getComment(id).resolved).toBe(true);

    fireEvent.click(container.querySelector('.be-comment-thread-delete'));
    expect(store.getComment(id)).toBeUndefined();
  });
});
