import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { insertBlock, removeBlock, updateRun, changeBlockType } from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['hello', 'world'], props: {} },
      { id: 'hello', type: 'paragraph', parentId: 'root', contentIds: ['rHello'], props: {} },
      { id: 'world', type: 'paragraph', parentId: 'root', contentIds: ['rWorld'], props: {} },
    ],
    runs: [
      { id: 'rHello', type: 'text', value: 'Hello', marks: {} },
      { id: 'rWorld', type: 'text', value: 'World', marks: {} },
    ],
  };
}

function makeLeafBlock(id, runId, value) {
  return {
    block: { id, type: 'paragraph', parentId: 'root', contentIds: [runId], props: {} },
    subtree: {
      blocks: [{ id, type: 'paragraph', parentId: 'root', contentIds: [runId], props: {} }],
      runs: [{ id: runId, type: 'text', value, marks: {} }],
    },
  };
}

/** Applies `op` to `store`, then delivers the resulting envelope to every store in `peers`. */
function applyAndBroadcast(store, op, peers) {
  store.applyOperation(op);
  const envelope = store.getLastEnvelope();
  for (const peer of peers) peer.applyRemoteOperation(envelope);
  return envelope;
}

describe('EditorStore two-peer convergence: concurrent insert', () => {
  it('insert at start (peer A) and insert at end (peer B) both survive and converge identically on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    const { block: introBlock, subtree: introSubtree } = makeLeafBlock('intro', 'rIntro', 'Intro');
    applyAndBroadcast(storeA, insertBlock(introBlock, 'root', 0, introSubtree), [storeB]);

    const { block: noteBlock, subtree: noteSubtree } = makeLeafBlock('note', 'rNote', 'Note');
    applyAndBroadcast(storeB, insertBlock(noteBlock, 'root', 3, noteSubtree), [storeA]);

    expect(storeA.getBlock('root').contentIds).toEqual(storeB.getBlock('root').contentIds);
    expect(storeA.getBlock('root').contentIds).toEqual(['intro', 'hello', 'world', 'note']);
    expect(storeB.getRun('rIntro').value).toBe('Intro');
    expect(storeA.getRun('rNote').value).toBe('Note');
  });

  it('two peers concurrently inserting after the same anchor both survive, in a deterministic (identical on both sides) order', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    const { block: fromABlock, subtree: fromASubtree } = makeLeafBlock('fromA', 'rFromA', 'From A');
    storeA.applyOperation(insertBlock(fromABlock, 'root', 1, fromASubtree));
    const envelopeA = storeA.getLastEnvelope();

    const { block: fromBBlock, subtree: fromBSubtree } = makeLeafBlock('fromB', 'rFromB', 'From B');
    storeB.applyOperation(insertBlock(fromBBlock, 'root', 1, fromBSubtree));
    const envelopeB = storeB.getLastEnvelope();

    // cross-deliver, order of delivery shouldn't matter
    storeA.applyRemoteOperation(envelopeB);
    storeB.applyRemoteOperation(envelopeA);

    expect(storeA.getBlock('root').contentIds).toEqual(storeB.getBlock('root').contentIds);
    expect(storeA.getBlock('root').contentIds).toContain('fromA');
    expect(storeA.getBlock('root').contentIds).toContain('fromB');
  });
});

describe('EditorStore two-peer convergence: concurrent delete vs. edit', () => {
  it('a delete of a block wins over a concurrent edit of the same run — the run stays gone on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    // peer A deletes "world" locally (not yet delivered to B)
    storeA.applyOperation(removeBlock('world'));
    const deleteEnvelope = storeA.getLastEnvelope();

    // peer B concurrently (before seeing A's delete) edits "world"'s run
    storeB.applyOperation(updateRun('rWorld', { value: 'World (edited)' }));
    const editEnvelope = storeB.getLastEnvelope();

    // now cross-deliver both
    storeB.applyRemoteOperation(deleteEnvelope);
    storeA.applyRemoteOperation(editEnvelope);

    expect(storeA.getBlock('root').contentIds).toEqual(['hello']);
    expect(storeB.getBlock('root').contentIds).toEqual(['hello']);
    // the edit was applied locally on B before the delete arrived, but the
    // block (and its run) are gone from both stores' visible tree either way
    expect(storeA.getBlock('world')).toBeUndefined();
    expect(storeB.getBlock('world')).toBeUndefined();
  });
});

describe('EditorStore two-peer convergence: concurrent type-conversion', () => {
  it('two peers converting the same block to different types concurrently converge on the newer one, identically on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    storeA.applyOperation(changeBlockType('hello', 'heading', { level: 1 }));
    const envelopeA = storeA.getLastEnvelope();

    storeB.applyOperation(changeBlockType('hello', 'callout', { icon: '💡' }));
    const envelopeB = storeB.getLastEnvelope();

    storeA.applyRemoteOperation(envelopeB);
    storeB.applyRemoteOperation(envelopeA);

    const finalTypeA = storeA.getBlock('hello').type;
    const finalTypeB = storeB.getBlock('hello').type;
    expect(finalTypeA).toBe(finalTypeB);
    expect(['heading', 'callout']).toContain(finalTypeA);
    // exactly one conversion won outright -- props match whichever type won
    if (finalTypeA === 'heading') {
      expect(storeA.getBlock('hello').props.level).toBe(1);
      expect(storeB.getBlock('hello').props.level).toBe(1);
    } else {
      expect(storeA.getBlock('hello').props.icon).toBe('💡');
      expect(storeB.getBlock('hello').props.icon).toBe('💡');
    }
  });

  it('unrelated concurrent edits on the same block (one converts type, one edits its run) both survive', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    applyAndBroadcast(storeA, changeBlockType('hello', 'heading', { level: 2 }), [storeB]);
    applyAndBroadcast(storeB, updateRun('rHello', { value: 'Hello, edited' }), [storeA]);

    expect(storeA.getBlock('hello').type).toBe('heading');
    expect(storeB.getBlock('hello').type).toBe('heading');
    expect(storeA.getRun('rHello').value).toBe('Hello, edited');
    expect(storeB.getRun('rHello').value).toBe('Hello, edited');
  });
});

describe('EditorStore remote operations never enter the local undo stack', () => {
  it('applyRemoteOperation bypasses History entirely — local undo/redo only ever affects local edits', () => {
    const storeA = new History(new EditorStore(makeDoc()));
    const rawStoreB = new EditorStore(makeDoc());

    // local edit on A, goes through History as usual
    storeA.performBatch([updateRun('rHello', { value: 'Hello, local' })]);
    expect(storeA.canUndo()).toBe(true);

    // remote edit arrives on A's underlying store directly, bypassing History
    rawStoreB.applyOperation(updateRun('rWorld', { value: 'World, remote' }));
    storeA.store.applyRemoteOperation(rawStoreB.getLastEnvelope());

    expect(storeA.getRun('rWorld').value).toBe('World, remote');

    // undo must only revert the local edit, not the remote one
    storeA.undo();
    expect(storeA.getRun('rHello').value).toBe('Hello');
    expect(storeA.getRun('rWorld').value).toBe('World, remote'); // untouched by undo
    expect(storeA.canUndo()).toBe(false); // nothing left to undo -- the remote op was never on the stack
  });
});

describe('EditorStore + History: a remote write landing mid-local-coalescing-batch', () => {
  it('regression — without flushing on remote arrival, one local undo would wipe out the peer\'s interleaved edit too', () => {
    // Demonstrates the bug this test guards against: History's keystroke
    // coalescing (see history.js's 500ms idle window) has no visibility
    // into applyRemoteOperation, since that path deliberately never
    // touches History. If a remote write lands between two local
    // keystrokes on the same run and nothing closes the local batch, the
    // next local keystroke silently gets folded into a batch whose stored
    // "undo to" state predates the remote write — so undoing it reverts
    // the peer's edit too, not just the local one.
    // Explicit meta.timestamp on every perform() call, rather than relying
    // on the Date.now() default while fake timers are active — the two
    // aren't the same clock unless fake timers are configured to mock
    // Date too, and coupling this test's determinism to that is fragile.
    vi.useFakeTimers();
    try {
      const historyA = new History(new EditorStore(makeDoc()));
      const rawStoreB = new EditorStore(makeDoc());

      historyA.perform(updateRun('rHello', { value: 'Hello A1' }), { timestamp: 1000 });
      // Advance the fake clock so B1's HLC wallTime is deterministically
      // newer than A1's -- otherwise, under frozen fake time, both clock
      // stamps can tie and the LWW winner comes down to a random peerId
      // string comparison (genPeerId() is random per store), making the
      // test's outcome flaky rather than reflecting the actual scenario
      // (B typing after seeing A's edit, i.e. genuinely later in time).
      vi.advanceTimersByTime(10);

      rawStoreB.applyOperation(updateRun('rHello', { value: 'Hello A1 B1' }));
      historyA.store.applyRemoteOperation(rawStoreB.getLastEnvelope());
      // deliberately NOT flushing here -- this is the broken path

      historyA.perform(updateRun('rHello', { value: 'Hello A1 B1 A2' }), { timestamp: 1100 });
      vi.advanceTimersByTime(600);

      historyA.undo();
      // the bug: reverts all the way past B1, wiping the peer's edit
      expect(historyA.getRun('rHello').value).toBe('Hello');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fix — CollabSession flushes History on every remote op, so one local undo only reverts the local contribution', () => {
    vi.useFakeTimers();
    try {
      const historyA = new History(new EditorStore(makeDoc()));
      const rawStoreB = new EditorStore(makeDoc());

      historyA.perform(updateRun('rHello', { value: 'Hello A1' }), { timestamp: 1000 });
      // Advance the fake clock so B1's HLC wallTime is deterministically
      // newer than A1's -- otherwise, under frozen fake time, both clock
      // stamps can tie and the LWW winner comes down to a random peerId
      // string comparison (genPeerId() is random per store), making the
      // test's outcome flaky rather than reflecting the actual scenario
      // (B typing after seeing A's edit, i.e. genuinely later in time).
      vi.advanceTimersByTime(10);

      rawStoreB.applyOperation(updateRun('rHello', { value: 'Hello A1 B1' }));
      historyA.store.applyRemoteOperation(rawStoreB.getLastEnvelope());
      historyA.flush(); // what CollabSession._handleMessage does after every remote op

      historyA.perform(updateRun('rHello', { value: 'Hello A1 B1 A2' }), { timestamp: 1100 });
      vi.advanceTimersByTime(600);

      historyA.undo();
      expect(historyA.getRun('rHello').value).toBe('Hello A1 B1'); // only A2 reverted, B1 preserved

      historyA.undo();
      expect(historyA.getRun('rHello').value).toBe('Hello'); // second undo reverts A1 too
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('EditorStore two-peer convergence: tombstone garbage collection', () => {
  it('a block deleted on A, synced to B, and pruned by both after enough time -- a later insert near the pruned spot still lands correctly on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    const deleteTime = Date.now();
    const deleteEnvelope = (() => {
      storeA.applyOperation(removeBlock('hello'));
      return storeA.getLastEnvelope();
    })();
    storeB.applyRemoteOperation(deleteEnvelope);

    expect(storeA.getBlock('root').contentIds).toEqual(['world']);
    expect(storeB.getBlock('root').contentIds).toEqual(['world']);

    // both peers independently GC after "24h + margin" have passed -- no
    // coordination between them required, each just runs its own sweep
    const prunedOnA = storeA.pruneTombstones({ now: deleteTime + 24 * 60 * 60 * 1000 + 1000 });
    const prunedOnB = storeB.pruneTombstones({ now: deleteTime + 24 * 60 * 60 * 1000 + 1000 });
    expect(prunedOnA).toBe(1);
    expect(prunedOnB).toBe(1);
    expect(storeA.getTombstoneCount()).toBe(0);
    expect(storeB.getTombstoneCount()).toBe(0);

    // a fresh insert at the start of root (anchored to null, same spot the
    // pruned block used to occupy) must still resolve correctly on both
    const { block: introBlock, subtree: introSubtree } = makeLeafBlock('intro', 'rIntro', 'Intro');
    storeA.applyOperation(insertBlock(introBlock, 'root', 0, introSubtree));
    storeB.applyRemoteOperation(storeA.getLastEnvelope());

    expect(storeA.getBlock('root').contentIds).toEqual(['intro', 'world']);
    expect(storeB.getBlock('root').contentIds).toEqual(['intro', 'world']);
    expect(storeB.getRun('rIntro').value).toBe('Intro');
  });
});
