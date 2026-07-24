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
  it('character-level undo protects a peer\'s concurrent edit even when a local batch coalesces straight across a remote arrival', () => {
    // History's keystroke coalescing (see history.js's 500ms idle window)
    // has no visibility into applyRemoteOperation, since that path
    // deliberately never touches History -- so if a remote write lands
    // between two local keystrokes on the same run and nothing closes the
    // local batch, the next local keystroke silently coalesces into the
    // same undo entry as the one before the remote write. Under the OLD
    // whole-value-replace inverse this genuinely clobbered the peer's
    // edit (undoing meant "replace with an old full-string snapshot" that
    // simply didn't contain it). Under character-level undo (each actor's
    // inverse only ever references character ids THAT ACTOR inserted/
    // deleted), this is no longer possible even without flushing --
    // demonstrated here by deliberately skipping the flush CollabSession
    // normally does (see the next test) and confirming B's contribution
    // still survives regardless.
    // Explicit meta.timestamp on every perform() call, rather than relying
    // on the Date.now() default while fake timers are active — the two
    // aren't the same clock unless fake timers are configured to mock
    // Date too, and coupling this test's determinism to that is fragile.
    vi.useFakeTimers();
    try {
      const historyA = new History(new EditorStore(makeDoc()));
      const rawStoreB = new EditorStore(makeDoc());

      historyA.perform(updateRun('rHello', { value: 'Hello A1' }), { timestamp: 1000 });
      rawStoreB.applyRemoteOperation(historyA.store.getLastEnvelope()); // B properly syncs A's edit first, like a real peer would

      vi.advanceTimersByTime(10);
      rawStoreB.applyOperation(updateRun('rHello', { value: 'Hello A1 B1' })); // B appends after A's already-synced content
      historyA.store.applyRemoteOperation(rawStoreB.getLastEnvelope());
      // deliberately NOT flushing here -- this local batch is about to coalesce straight across B's remote arrival

      historyA.perform(updateRun('rHello', { value: 'Hello A1 B1 A2' }), { timestamp: 1100 });
      vi.advanceTimersByTime(600);

      historyA.undo(); // reverts BOTH of A's own coalesced ops (A1 and A2) in one step -- but only ever touches ids A itself inserted
      expect(historyA.getRun('rHello').value).toBe('Hello B1'); // B1 survives regardless of coalescing
    } finally {
      vi.useRealTimers();
    }
  });

  it('CollabSession flushing History on every remote op keeps each actor\'s own edits as separate undo steps', () => {
    vi.useFakeTimers();
    try {
      const historyA = new History(new EditorStore(makeDoc()));
      const rawStoreB = new EditorStore(makeDoc());

      historyA.perform(updateRun('rHello', { value: 'Hello A1' }), { timestamp: 1000 });
      rawStoreB.applyRemoteOperation(historyA.store.getLastEnvelope());

      vi.advanceTimersByTime(10);
      rawStoreB.applyOperation(updateRun('rHello', { value: 'Hello A1 B1' }));
      historyA.store.applyRemoteOperation(rawStoreB.getLastEnvelope());
      historyA.flush(); // what CollabSession._handleMessage does after every remote op

      historyA.perform(updateRun('rHello', { value: 'Hello A1 B1 A2' }), { timestamp: 1100 });
      vi.advanceTimersByTime(600);

      historyA.undo();
      expect(historyA.getRun('rHello').value).toBe('Hello A1 B1'); // only A2 reverted, B1 preserved

      historyA.undo();
      expect(historyA.getRun('rHello').value).toBe('Hello B1'); // second undo reverts A1 too -- B1 still untouched either way
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

describe('EditorStore character-level text merge: concurrent edits to the same run', () => {
  it('concurrent edits at disjoint positions in the same run both survive and converge identically on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    // A prepends, B appends -- to the SAME original "Hello", independently
    // (both local edits applied BEFORE either side has seen the other's --
    // a genuine concurrent edit, not a sequential one).
    storeA.applyOperation(updateRun('rHello', { value: '>>Hello' }));
    const envelopeA = storeA.getLastEnvelope();
    storeB.applyOperation(updateRun('rHello', { value: 'Hello<<' }));
    const envelopeB = storeB.getLastEnvelope();

    storeA.applyRemoteOperation(envelopeB);
    storeB.applyRemoteOperation(envelopeA);

    expect(storeA.getRun('rHello').value).toBe(storeB.getRun('rHello').value);
    // both edits present, original text intact in the middle
    expect(storeA.getRun('rHello').value).toContain('>>');
    expect(storeA.getRun('rHello').value).toContain('<<');
    expect(storeA.getRun('rHello').value).toContain('Hello');
  });

  it('concurrent inserts at the exact same position both survive (interleaved), identically on both sides', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());

    storeA.applyOperation(updateRun('rHello', { value: 'HelloA' }));
    const envelopeA = storeA.getLastEnvelope();
    storeB.applyOperation(updateRun('rHello', { value: 'HelloB' }));
    const envelopeB = storeB.getLastEnvelope();

    // cross-deliver, order of delivery shouldn't matter
    storeA.applyRemoteOperation(envelopeB);
    storeB.applyRemoteOperation(envelopeA);

    expect(storeA.getRun('rHello').value).toBe(storeB.getRun('rHello').value);
    expect(storeA.getRun('rHello').value).toContain('A');
    expect(storeA.getRun('rHello').value).toContain('B');
    expect(storeA.getRun('rHello').value.startsWith('Hello')).toBe(true);
  });

  it('a concurrent delete and a concurrent edit of DIFFERENT parts of the same run both survive', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    // Both start from the same synced baseline before either makes its own edit.
    applyAndBroadcast(storeA, updateRun('rHello', { value: 'Hello World' }), [storeB]);

    // A deletes " World"; B, concurrently (from that same 'Hello World' baseline,
    // before seeing A's delete), edits "Hello" into "Howdy".
    storeA.applyOperation(updateRun('rHello', { value: 'Hello' }));
    const envelopeA = storeA.getLastEnvelope();
    storeB.applyOperation(updateRun('rHello', { value: 'Howdy World' }));
    const envelopeB = storeB.getLastEnvelope();

    storeA.applyRemoteOperation(envelopeB);
    storeB.applyRemoteOperation(envelopeA);

    // A's deletion of " World" and B's "Hello"->"Howdy" edit are disjoint character
    // ranges -- both survive, identically on both sides.
    expect(storeA.getRun('rHello').value).toBe(storeB.getRun('rHello').value);
    expect(storeA.getRun('rHello').value).toBe('Howdy');
  });

  it('undo of a local text edit never removes a peer\'s concurrent characters, even interleaved at the same position', () => {
    const storeA = new History(new EditorStore(makeDoc()));
    const storeB = new EditorStore(makeDoc());

    storeA.perform(updateRun('rHello', { value: 'HelloA' })); // A appends "A"
    storeB.applyOperation(updateRun('rHello', { value: 'HelloB' })); // B, concurrently, appends "B"
    storeA.store.applyRemoteOperation(storeB.getLastEnvelope()); // B's edit arrives on A's side

    const beforeUndo = storeA.getRun('rHello').value;
    expect(beforeUndo).toContain('A'); // A's own char present
    expect(beforeUndo).toContain('B'); // B's concurrent char present too

    storeA.undo(); // undo ONLY A's own "A" insertion

    const afterUndo = storeA.getRun('rHello').value;
    expect(afterUndo).toBe('HelloB'); // A's "A" is gone, B's "B" survives untouched
  });

  it('undo -> redo -> undo of a text edit cycles correctly and repeatably', () => {
    const store = new History(new EditorStore(makeDoc()));
    store.perform(updateRun('rHello', { value: 'Hello there' }));
    expect(store.getRun('rHello').value).toBe('Hello there');

    store.undo();
    expect(store.getRun('rHello').value).toBe('Hello');

    store.redo();
    expect(store.getRun('rHello').value).toBe('Hello there');

    store.undo();
    expect(store.getRun('rHello').value).toBe('Hello');

    store.redo();
    expect(store.getRun('rHello').value).toBe('Hello there');
  });

  it('getTombstoneCount/pruneTombstones include run-level character tombstones', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(updateRun('rHello', { value: 'Hello World' }));
    const deleteTime = Date.now();
    store.applyOperation(updateRun('rHello', { value: 'Hello' })); // deletes " World" (6 chars)

    expect(store.getTombstoneCount()).toBeGreaterThanOrEqual(6);

    const pruned = store.pruneTombstones({ now: deleteTime + 24 * 60 * 60 * 1000 + 1000 });
    expect(pruned).toBeGreaterThanOrEqual(6);
    // pruning is invisible content only -- the visible value is unaffected
    expect(store.getRun('rHello').value).toBe('Hello');
  });
});
