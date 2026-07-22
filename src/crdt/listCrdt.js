import { HLC } from './clock.js';

/**
 * Replicated ordered list, keyed by externally-owned stable ids (Noteloom's
 * existing block/run ids — this module never generates ids, only orders
 * and tombstones the ones it's given). Each item's position is defined
 * relative to a neighbor id ("insert after X"), not an array index, so
 * concurrent inserts/deletes at different local positions merge
 * deterministically regardless of what order the operations are applied
 * in on a given peer.
 *
 * Concurrent inserts anchored to the exact same origin are ordered
 * newest-first (by clock, then peerId) so a live edit lands as close to
 * its anchor as possible. Sequential inserts from one peer/batch (each
 * anchored to the id it just inserted, not re-anchored to the original
 * origin — the natural way typing and multi-block paste already work)
 * are never split apart by a concurrent peer's insert at the same
 * origin. A concurrent *non-chained* multi-item insert at the same
 * anchor by two peers can still interleave with this simpler
 * (RGA-style) scheme; convergence still holds, only interleave-avoidance
 * is partial rather than the full Fugue tree guarantee.
 */
export class ListCrdtState {
  constructor() {
    this.slots = new Map();
  }

  /** Builds CRDT state from an existing plain-array order (e.g. loading a v1 document with no CRDT history). */
  static fromArray(ids, { peerId = 'legacy' } = {}) {
    const state = new ListCrdtState();
    let prev = null;
    for (const id of ids) {
      state.slots.set(id, {
        id,
        originId: prev,
        peerId,
        clock: { wallTime: 0, counter: 0, peerId },
        deleted: false,
      });
      prev = id;
    }
    return state;
  }

  has(id) {
    return this.slots.has(id);
  }

  /** The raw slot for `id` ({id, originId, peerId, clock, deleted}), or undefined — used to build a wire envelope for a change that was just made. */
  getSlot(id) {
    return this.slots.get(id);
  }

  isDeleted(id) {
    const slot = this.slots.get(id);
    return !slot || slot.deleted;
  }

  /**
   * Inserts `id` immediately after `afterId` (null = at the very start).
   * Idempotent: re-inserting an id that already has a slot is a no-op,
   * which guards against duplicate delivery over an unreliable transport.
   */
  insert(id, afterId, clock, peerId) {
    if (this.slots.has(id)) return;
    this.slots.set(id, { id, originId: afterId, peerId, clock, deleted: false });
  }

  delete(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.deleted = true;
  }

  /** Undoes a local delete in place, preserving the slot's original position. */
  restore(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.deleted = false;
  }

  /**
   * Repositions an existing slot to a new anchor in place, rather than
   * tombstoning it and creating a new one — there is only ever one slot
   * per id in a given list, so a same-list reorder (or moving a block
   * back to a parent it was in before) must reuse it. Local-only for now:
   * concurrent moves of the same id by two peers have no defined merge
   * rule yet (last local move simply wins), since there's no remote path
   * exercising this until the transport layer exists.
   *
   * Splices the slot out of the chain BEFORE re-anchoring it: anything
   * currently anchored directly after `id` gets reparented to `id`'s old
   * origin first. Without this, moving a node to an anchor that's
   * currently one of its own (transitive) successors creates a cycle —
   * e.g. a->b->c, "move a to after c" naively sets a.originId='c', but
   * c.originId is (transitively) 'a', so the walk from the list start can
   * no longer reach any of them. Splicing `id` out first means whatever
   * anchor is chosen can never depend on `id` still being where it was.
   */
  move(id, afterId, clock, peerId) {
    if (afterId === id) return;
    const slot = this.slots.get(id);
    if (!slot) return;
    const oldOriginId = slot.originId;
    for (const other of this.slots.values()) {
      if (other.originId === id) other.originId = oldOriginId;
    }
    slot.originId = afterId;
    slot.peerId = peerId;
    slot.clock = clock;
    slot.deleted = false;
  }

  /**
   * Merges another peer's slot set into this one. Safe to call with
   * slots in any order, any number of times — idempotent, commutative,
   * and associative — which is what makes convergence hold regardless
   * of network delivery order.
   */
  merge(remoteSlots) {
    for (const remote of remoteSlots) {
      const local = this.slots.get(remote.id);
      if (!local) {
        this.slots.set(remote.id, { ...remote });
      } else if (remote.deleted && !local.deleted) {
        local.deleted = true;
      }
      // originId/peerId/clock never change after a slot is created —
      // a slot's structural identity is fixed at insert time; `deleted`
      // is the only field that can change, and only monotonically
      // (existence-wins: once deleted, always deleted).
    }
  }

  /** Every slot as a plain array, for persistence/transport. */
  toSlotArray() {
    return Array.from(this.slots.values());
  }

  /**
   * Materializes the currently-visible order as a plain array of ids
   * (tombstoned ids excluded) — this is what gets projected onto
   * Block.contentIds after every structural change.
   */
  toArray() {
    const childrenByOrigin = new Map();
    for (const slot of this.slots.values()) {
      const bucket = childrenByOrigin.get(slot.originId);
      if (bucket) bucket.push(slot);
      else childrenByOrigin.set(slot.originId, [slot]);
    }
    for (const bucket of childrenByOrigin.values()) {
      bucket.sort((a, b) => HLC.compare(b.clock, a.clock));
    }

    const result = [];
    // Explicit-stack depth-first walk — a naive recursive walk's depth
    // equals the list length on a long simple chain (the common case for
    // typed/sequential content), which risks a stack overflow on large
    // documents.
    const stack = [...(childrenByOrigin.get(null) ?? [])].reverse();
    while (stack.length > 0) {
      const slot = stack.pop();
      if (!slot.deleted) result.push(slot.id);
      const children = childrenByOrigin.get(slot.id);
      if (children) {
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
    }
    return result;
  }
}
