import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { addCommentThread, removeCommentThread, addCommentReply, resolveComment } from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  };
}

function makeThread(overrides = {}) {
  return {
    id: 'c1',
    blockId: 'p1',
    anchorRunIds: ['r1', 'r1'],
    resolved: false,
    messages: [{ id: 'm1', authorId: 'alice', text: 'looks good?', createdAt: 1 }],
    ...overrides,
  };
}

/** Applies `op` to `store`, then delivers the resulting envelope to every store in `peers`. */
function applyAndBroadcast(store, op, peers) {
  store.applyOperation(op);
  const envelope = store.getLastEnvelope();
  for (const peer of peers) peer.applyRemoteOperation(envelope);
  return envelope;
}

describe('EditorStore comments CRUD', () => {
  it('addCommentThread adds a thread, retrievable via getComment/getComments', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    expect(store.getComment('c1')).toEqual(makeThread());
    expect(store.getComments()).toEqual([makeThread()]);
  });

  it('getComments returns the same array reference until a comments op runs', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    const first = store.getComments();
    const second = store.getComments();
    expect(first).toBe(second);
    store.applyOperation(resolveComment('c1', true));
    expect(store.getComments()).not.toBe(first);
  });

  it('addCommentReply appends a message without disturbing existing ones', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    store.applyOperation(addCommentReply('c1', { id: 'm2', authorId: 'bob', text: 'yep', createdAt: 2 }));
    expect(store.getComment('c1').messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('resolveComment flips the resolved flag', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    store.applyOperation(resolveComment('c1', true));
    expect(store.getComment('c1').resolved).toBe(true);
  });

  it('removeCommentThread deletes it', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    store.applyOperation(removeCommentThread('c1'));
    expect(store.getComment('c1')).toBeUndefined();
  });

  it('toJSON/constructor round-trips comments', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addCommentThread(makeThread()));
    const json = store.toJSON();
    const restored = new EditorStore(json);
    expect(restored.getComment('c1')).toEqual(makeThread());
  });
});

describe('EditorStore comments undo/redo (via History)', () => {
  it('undo/redo a full add-reply-resolve-remove sequence', () => {
    const history = new History(new EditorStore(makeDoc()));
    history.perform(addCommentThread(makeThread()));
    history.perform(addCommentReply('c1', { id: 'm2', authorId: 'bob', text: 'yep', createdAt: 2 }));
    history.perform(resolveComment('c1', true));

    expect(history.getComment('c1').resolved).toBe(true);
    expect(history.getComment('c1').messages.length).toBe(2);

    history.undo(); // undo resolve
    expect(history.getComment('c1').resolved).toBe(false);

    history.undo(); // undo reply
    expect(history.getComment('c1').messages.length).toBe(1);

    history.undo(); // undo add thread
    expect(history.getComment('c1')).toBeUndefined();

    history.redo();
    expect(history.getComment('c1')).toBeDefined();
    history.redo();
    expect(history.getComment('c1').messages.length).toBe(2);
    history.redo();
    expect(history.getComment('c1').resolved).toBe(true);
  });
});

describe('EditorStore two-peer convergence: comment thread metadata', () => {
  it('addCommentThread broadcasts and applies remotely', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addCommentThread(makeThread()), [storeB]);
    expect(storeB.getComment('c1')).toEqual(makeThread());
  });

  it('a reply from one peer merges into the other without clobbering an already-applied reply', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addCommentThread(makeThread()), [storeB]);

    applyAndBroadcast(storeA, addCommentReply('c1', { id: 'm2', authorId: 'bob', text: 'from A', createdAt: 2 }), [storeB]);
    applyAndBroadcast(storeB, addCommentReply('c1', { id: 'm3', authorId: 'carol', text: 'from B', createdAt: 3 }), [storeA]);

    expect(storeA.getComment('c1').messages.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    expect(storeB.getComment('c1').messages.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('duplicate delivery of the same reply envelope is a no-op (idempotent)', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addCommentThread(makeThread()), [storeB]);

    storeA.applyOperation(addCommentReply('c1', { id: 'm2', authorId: 'bob', text: 'hi', createdAt: 2 }));
    const envelope = storeA.getLastEnvelope();
    storeB.applyRemoteOperation(envelope);
    storeB.applyRemoteOperation(envelope); // delivered twice

    expect(storeB.getComment('c1').messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('resolveComment broadcasts to a connected peer', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addCommentThread(makeThread()), [storeB]);
    applyAndBroadcast(storeA, resolveComment('c1', true), [storeB]);
    expect(storeB.getComment('c1').resolved).toBe(true);
  });

  it('removeCommentThread broadcasts to a connected peer', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addCommentThread(makeThread()), [storeB]);
    applyAndBroadcast(storeA, removeCommentThread('c1'), [storeB]);
    expect(storeB.getComment('c1')).toBeUndefined();
  });

  it('a reply arriving before its thread (out-of-order delivery) is silently dropped, not thrown', () => {
    const storeB = new EditorStore(makeDoc());
    expect(() => storeB.applyRemoteOperation({ kind: 'commentWrite', op: 'addReply', commentId: 'never-arrived', message: { id: 'm2', authorId: 'bob', text: 'hi', createdAt: 2 } })).not.toThrow();
    expect(storeB.getComment('never-arrived')).toBeUndefined();
  });
});

describe('getAllRunIds', () => {
  it('returns every run id in the document', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'a', marks: {} },
        { id: 'r2', type: 'text', value: 'b', marks: {} },
      ],
    };
    const store = new EditorStore(doc);
    expect(store.getAllRunIds().sort()).toEqual(['r1', 'r2']);
  });
});
