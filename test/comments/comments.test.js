import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { addComment, replyToComment, resolveComment, deleteComment } from '../../src/comments/comments.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'Hello world', marks: {} }],
  };
}

const range = { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 };

describe('addComment / replyToComment / resolveComment / deleteComment (high-level API)', () => {
  it('addComment creates a thread and highlights the range', () => {
    const history = new History(new EditorStore(makeDoc()));
    const commentId = addComment(history, range, { authorId: 'alice', text: 'check this' });

    const thread = history.getComment(commentId);
    expect(thread.messages[0]).toMatchObject({ authorId: 'alice', text: 'check this' });
    expect(thread.resolved).toBe(false);

    const firstRunId = history.getBlock('p1').contentIds[0];
    expect(history.getRun(firstRunId).marks.commentIds).toEqual([commentId]);
  });

  it('addComment is one atomic undo step (mark + thread undo together)', () => {
    const history = new History(new EditorStore(makeDoc()));
    const commentId = addComment(history, range, { authorId: 'alice', text: 'check this' });

    history.undo();
    expect(history.getComment(commentId)).toBeUndefined();
    expect(history.getBlock('p1').contentIds).toEqual(['r1']);
    expect(history.getRun('r1').marks.commentIds).toBeUndefined();

    history.redo();
    expect(history.getComment(commentId)).toBeDefined();
  });

  it('replyToComment appends a message', () => {
    const history = new History(new EditorStore(makeDoc()));
    const commentId = addComment(history, range, { authorId: 'alice', text: 'check this' });
    replyToComment(history, commentId, { authorId: 'bob', text: 'looks fine' });

    expect(history.getComment(commentId).messages.map((m) => m.text)).toEqual(['check this', 'looks fine']);
  });

  it('resolveComment flips the resolved flag, defaulting to true', () => {
    const history = new History(new EditorStore(makeDoc()));
    const commentId = addComment(history, range, { authorId: 'alice', text: 'check this' });
    resolveComment(history, commentId);
    expect(history.getComment(commentId).resolved).toBe(true);
  });

  it('deleteComment removes the thread and strips the highlight, as one atomic undo step', () => {
    const history = new History(new EditorStore(makeDoc()));
    const commentId = addComment(history, range, { authorId: 'alice', text: 'check this' });
    deleteComment(history, commentId);

    expect(history.getComment(commentId)).toBeUndefined();
    const runIds = history.getAllRunIds();
    for (const id of runIds) expect(history.getRun(id).marks.commentIds ?? []).not.toContain(commentId);

    history.undo();
    expect(history.getComment(commentId)).toBeDefined();
    const firstRunId = history.getBlock('p1').contentIds[0];
    expect(history.getRun(firstRunId).marks.commentIds).toEqual([commentId]);
  });

  it('works directly against a plain EditorStore (no History wrapper) too', () => {
    const store = new EditorStore(makeDoc());
    const commentId = addComment(store, range, { authorId: 'alice', text: 'no history here' });
    expect(store.getComment(commentId)).toBeDefined();
  });
});
