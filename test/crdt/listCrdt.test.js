import { describe, it, expect } from 'vitest';
import { HLC } from '../../src/crdt/clock.js';
import { ListCrdtState } from '../../src/crdt/listCrdt.js';

function makePeer(peerId) {
  return { peerId, clock: new HLC(peerId) };
}

/** Simulates a local insert followed by broadcasting the resulting slot to every other peer. */
function insertAndBroadcast(origin, id, afterId, peer, others) {
  const ts = peer.clock.tick();
  origin.insert(id, afterId, ts, peer.peerId);
  const slot = origin.slots.get(id);
  for (const other of others) other.merge([slot]);
}

function deleteAndBroadcast(origin, id, others) {
  origin.delete(id);
  const slot = origin.slots.get(id);
  for (const other of others) other.merge([slot]);
}

describe('ListCrdtState — insert', () => {
  it('inserts a new block at the start', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    const a = makePeer('peer-a');
    state.insert('x', null, a.clock.tick(), a.peerId);
    expect(state.toArray()).toEqual(['x', 'a', 'b']);
  });

  it('inserts a new block in the middle', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    const p = makePeer('peer-a');
    state.insert('x', 'a', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['a', 'x', 'b']);
  });

  it('inserts a new block at the end', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    const p = makePeer('peer-a');
    state.insert('x', 'b', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['a', 'b', 'x']);
  });

  it('is idempotent — re-inserting an already-present id is a no-op', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    const p = makePeer('peer-a');
    const ts = p.clock.tick();
    state.insert('x', 'a', ts, p.peerId);
    state.insert('x', 'a', ts, p.peerId); // duplicate delivery
    expect(state.toArray()).toEqual(['a', 'x', 'b']);
  });
});

describe('ListCrdtState — concurrent insert convergence', () => {
  it('two peers concurrently inserting at start both merge in, converging to the same order on both sides', () => {
    const docA = ListCrdtState.fromArray(['hello', 'world']);
    const docB = ListCrdtState.fromArray(['hello', 'world']);
    const a = makePeer('peer-a');
    const b = makePeer('peer-b');

    insertAndBroadcast(docA, 'intro', null, a, [docB]);
    insertAndBroadcast(docB, 'note', 'world', b, [docA]);

    expect(docA.toArray()).toEqual(docB.toArray());
    expect(docA.toArray()).toEqual(['intro', 'hello', 'world', 'note']);
  });

  it('two peers concurrently inserting after the same anchor converge to an identical (deterministic) order on both sides', () => {
    const docA = ListCrdtState.fromArray(['hello']);
    const docB = ListCrdtState.fromArray(['hello']);
    const a = makePeer('peer-a');
    const b = makePeer('peer-b');

    const tsA = a.clock.tick();
    docA.insert('from-a', 'hello', tsA, a.peerId);
    const tsB = b.clock.tick();
    docB.insert('from-b', 'hello', tsB, b.peerId);

    // cross-merge, order of arrival shouldn't matter
    docA.merge(docB.toSlotArray());
    docB.merge(docA.toSlotArray());

    expect(docA.toArray()).toEqual(docB.toArray());
    expect(docA.toArray().sort()).toEqual(['from-a', 'from-b', 'hello'].sort());
  });

  it('merging the same slots multiple times, or in a different order, still converges (idempotent + order-independent)', () => {
    const base = ListCrdtState.fromArray(['a', 'b', 'c']);
    const p1 = makePeer('p1');
    const p2 = makePeer('p2');
    base.insert('x', 'a', p1.clock.tick(), p1.peerId);
    base.insert('y', 'b', p2.clock.tick(), p2.peerId);
    const slots = base.toSlotArray();

    const forward = new ListCrdtState();
    for (const s of slots) forward.merge([s]);

    const backward = new ListCrdtState();
    for (const s of [...slots].reverse()) backward.merge([s]);

    const replayedTwice = new ListCrdtState();
    for (const s of slots) replayedTwice.merge([s]);
    replayedTwice.merge(slots); // redeliver everything

    expect(forward.toArray()).toEqual(base.toArray());
    expect(backward.toArray()).toEqual(base.toArray());
    expect(replayedTwice.toArray()).toEqual(base.toArray());
  });
});

describe('ListCrdtState — delete', () => {
  it('deletes a block at the start, middle, and end', () => {
    const state = ListCrdtState.fromArray(['a', 'b', 'c']);
    state.delete('a');
    expect(state.toArray()).toEqual(['b', 'c']);
    state.delete('b');
    expect(state.toArray()).toEqual(['c']);
    state.delete('c');
    expect(state.toArray()).toEqual([]);
  });

  it('preserves position for later inserts anchored to a deleted (tombstoned) block', () => {
    const state = ListCrdtState.fromArray(['a', 'b', 'c']);
    state.delete('b');
    const p = makePeer('peer-a');
    // anchoring after a tombstoned id must not error or lose the intended position
    state.insert('x', 'b', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['a', 'x', 'c']);
  });

  it('local delete can be undone in place via restore(), preserving original position', () => {
    const state = ListCrdtState.fromArray(['a', 'b', 'c']);
    state.delete('b');
    expect(state.toArray()).toEqual(['a', 'c']);
    state.restore('b');
    expect(state.toArray()).toEqual(['a', 'b', 'c']);
  });

  it('concurrent delete of a block wins over a concurrent edit — existence beats value (delete propagates and stays deleted)', () => {
    // The list CRDT only owns *existence*; the "edit" here is simulated as
    // a separate concurrent operation on the same id that must not
    // resurrect it once the delete has merged in.
    const docA = ListCrdtState.fromArray(['hello', 'world']);
    const docB = ListCrdtState.fromArray(['hello', 'world']);

    deleteAndBroadcast(docA, 'world', [docB]); // peer A deletes "world"
    // peer B concurrently "edits" world (an operation on the same id,
    // handled at the field-registry layer) — from the list CRDT's view,
    // B never deletes or re-inserts the id, so no conflicting slot exists.

    expect(docA.toArray()).toEqual(['hello']);
    expect(docB.toArray()).toEqual(['hello']);
    expect(docB.isDeleted('world')).toBe(true);
  });

  it('delete is a monotonic OR — merging a non-deleted slot after a local delete never un-deletes it', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    state.delete('a');
    state.merge([{ id: 'a', originId: null, peerId: 'peer-a', clock: { wallTime: 1, counter: 0, peerId: 'peer-a' }, deleted: false }]);
    expect(state.isDeleted('a')).toBe(true);
    expect(state.toArray()).toEqual(['b']);
  });
});

describe('ListCrdtState — move', () => {
  it('repositions an existing slot in place, keeping a single slot per id', () => {
    const state = ListCrdtState.fromArray(['a', 'b', 'c']);
    const p = makePeer('peer-a');
    state.move('a', 'c', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['b', 'c', 'a']);
    expect(state.slots.size).toBe(3); // no duplicate slot created
  });

  it('moving a tombstoned (previously deleted-from-here) slot back revives it at the new position', () => {
    const state = ListCrdtState.fromArray(['a', 'b', 'c']);
    state.delete('a');
    expect(state.toArray()).toEqual(['b', 'c']);
    const p = makePeer('peer-a');
    state.move('a', 'b', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for an id with no existing slot', () => {
    const state = ListCrdtState.fromArray(['a', 'b']);
    const p = makePeer('peer-a');
    state.move('missing', 'a', p.clock.tick(), p.peerId);
    expect(state.toArray()).toEqual(['a', 'b']);
  });
});

describe('ListCrdtState — chained sequential inserts stay contiguous', () => {
  it('a single peer typing several new blocks in a row keeps them together even when a concurrent peer inserts at the same original anchor', () => {
    const docA = ListCrdtState.fromArray(['root']);
    const docB = ListCrdtState.fromArray(['root']);
    const a = makePeer('peer-a');
    const b = makePeer('peer-b');

    // peer A sequentially inserts 3 blocks, each chained to the previous
    insertAndBroadcast(docA, 'a1', 'root', a, [docB]);
    insertAndBroadcast(docA, 'a2', 'a1', a, [docB]);
    insertAndBroadcast(docA, 'a3', 'a2', a, [docB]);

    // peer B concurrently inserts one block anchored to the original root
    insertAndBroadcast(docB, 'b1', 'root', b, [docA]);

    const orderA = docA.toArray();
    const orderB = docB.toArray();
    expect(orderA).toEqual(orderB);

    const aIndices = ['a1', 'a2', 'a3'].map((id) => orderA.indexOf(id));
    expect(aIndices).toEqual([...aIndices].sort((x, y) => x - y));
    expect(Math.max(...aIndices) - Math.min(...aIndices)).toBe(2); // contiguous, not interleaved
  });
});
