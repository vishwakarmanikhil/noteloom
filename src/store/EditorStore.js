import {
  OP,
  insertBlock,
  removeBlock,
  moveBlock,
  changeBlockType,
  updateBlockProps,
  updateRun,
  setBlockContentIds,
  replaceRunSpan,
  setBlockRuns,
  addFieldType,
  updateFieldType,
  removeFieldType,
} from './operations.js';
import { ListCrdtState } from '../crdt/listCrdt.js';
import { HLC, genPeerId } from '../crdt/clock.js';
import { FieldClockRegistry } from '../crdt/fieldRegistry.js';

/** Sentinel subscribe/notify key for "the fieldTypes collection changed" — see useFieldTypes. */
const FIELD_TYPES_KEY = '$fieldTypes';

/**
 * Flat, normalized document store with per-id pub-sub.
 *
 * Every write replaces only the object(s) whose data actually changed, so
 * `getBlock(id)`/`getRun(id)` return a referentially stable value across any
 * update that doesn't touch that exact id. That stability is what lets
 * `useSyncExternalStore` (in the React bindings) skip re-rendering anything
 * that wasn't part of a given operation.
 *
 * Whether a given child id in `contentIds` refers to another Block or to a
 * Run is never encoded on the store — it's discovered by membership (ids are
 * unique across both maps), which keeps the store decoupled from the block
 * type registry.
 */
export class EditorStore {
  constructor(doc) {
    this.blocks = new Map((doc?.blocks ?? []).map((b) => [b.id, b]));
    this.runs = new Map((doc?.runs ?? []).map((r) => [r.id, r]));
    this.rootId = doc?.rootId ?? null;
    this.fieldTypes = new Map((doc?.fieldTypes ?? []).map((f) => [f.id, f]));
    this._fieldTypesSnapshot = null; // invalidated (set to null) on every fieldTypes mutation — see getFieldTypes
    this._listeners = new Map(); // id -> Set<() => void>
    this._globalListeners = new Set(); // fired on every mutation regardless of which id(s) changed -- see subscribeAll

    // Collaborative-editing merge state. Not yet reachable from any remote
    // transport (that's a later phase) -- for now this only tracks logical
    // clocks and CRDT-safe ordering locally, so `type`/props/run edits and
    // block insert/remove/move are all merge-ready without changing any
    // observable behavior for a single local user. Session-scoped: not
    // persisted by toJSON/fromJSON, since there's no remote peer yet that
    // could need it to survive a reload.
    this._peerId = genPeerId();
    this._clock = new HLC(this._peerId);
    this._fieldClocks = new FieldClockRegistry();
    this._orders = new Map(); // parent block id -> ListCrdtState over its contentIds, lazily seeded on first touch — see _getOrder
  }

  /** Lazily seeds a block's ordering CRDT state from its current (plain-array) contentIds the first time it's touched. */
  _getOrder(parentId) {
    let order = this._orders.get(parentId);
    if (!order) {
      const block = this.blocks.get(parentId);
      order = ListCrdtState.fromArray(block?.contentIds ?? [], { peerId: 'legacy' });
      this._orders.set(parentId, order);
    }
    return order;
  }

  getBlock(id) {
    return this.blocks.get(id);
  }

  getRun(id) {
    return this.runs.get(id);
  }

  /**
   * Persisted, user-created custom select field types (static only) —
   * insertion order. Returns the SAME array reference across calls unless
   * a fieldTypes op ran in between — required for useSyncExternalStore
   * (see useFieldTypes), same reference-stability contract as
   * getBlock/getRun.
   */
  getFieldTypes() {
    if (!this._fieldTypesSnapshot) this._fieldTypesSnapshot = [...this.fieldTypes.values()];
    return this._fieldTypesSnapshot;
  }

  getFieldType(id) {
    return this.fieldTypes.get(id);
  }

  getRootId() {
    return this.rootId;
  }

  subscribe(id, listener) {
    let set = this._listeners.get(id);
    if (!set) {
      set = new Set();
      this._listeners.set(id, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this._listeners.delete(id);
    };
  }

  /**
   * Fires on every mutation, local or remote (applyOperation and
   * applyRemoteOperation both funnel through _notify), regardless of
   * which specific id(s) changed — unlike subscribe(id, ...), which is
   * scoped to one id for render-isolation purposes. Meant for
   * whole-document concerns like auto-persistence, not for UI rendering
   * (a component re-rendering on every edit anywhere defeats the point of
   * per-id subscriptions).
   */
  subscribeAll(listener) {
    this._globalListeners.add(listener);
    return () => this._globalListeners.delete(listener);
  }

  _notify(touchedIds) {
    for (const id of touchedIds) {
      const set = this._listeners.get(id);
      if (!set) continue;
      // copy before iterating: a listener may unsubscribe during notification
      for (const listener of [...set]) listener();
    }
    if (this._globalListeners.size > 0) {
      for (const listener of [...this._globalListeners]) listener();
    }
  }

  /** Recursively collects a block (or run) and everything reachable under it. */
  _captureSubtree(rootId) {
    const blocks = [];
    const runs = [];
    const walk = (id) => {
      if (this.runs.has(id)) {
        runs.push(this.runs.get(id));
        return;
      }
      const block = this.blocks.get(id);
      if (!block) return;
      blocks.push(block);
      for (const childId of block.contentIds) walk(childId);
      // A block type (e.g. list_item) may hold its own inline runs in
      // props.titleRunIds alongside nested child blocks in contentIds.
      // Walk that too, generically, so nothing gets orphaned on delete.
      for (const runId of block.props?.titleRunIds ?? []) walk(runId);
    };
    walk(rootId);
    return { blocks, runs };
  }

  _deleteSubtree(rootId) {
    const walk = (id) => {
      if (this.runs.has(id)) {
        this.runs.delete(id);
        return;
      }
      const block = this.blocks.get(id);
      if (!block) return;
      for (const childId of block.contentIds) walk(childId);
      for (const runId of block.props?.titleRunIds ?? []) walk(runId);
      this.blocks.delete(id);
    };
    walk(rootId);
  }

  /**
   * Applies one operation, mutating only the affected map entries, and
   * returns the inverse operation (computed from state captured *before* the
   * mutation, per-op — never reconstructed afterward).
   */
  applyOperation(op) {
    switch (op.type) {
      case OP.UPDATE_RUN: {
        const run = this.runs.get(op.id);
        const previousPatch = {};
        const clocks = {};
        for (const key of Object.keys(op.patch)) {
          previousPatch[key] = run[key];
          clocks[key] = this._clock.tick();
          this._fieldClocks.recordLocal(op.id, key, clocks[key]);
        }
        this.runs.set(op.id, { ...run, ...op.patch });
        this._lastEnvelope = { kind: 'fieldWrite', target: 'run', id: op.id, patch: op.patch, clocks };
        this._notify([op.id]);
        return updateRun(op.id, previousPatch);
      }

      case OP.UPDATE_BLOCK_PROPS: {
        const block = this.blocks.get(op.id);
        const previousPatch = {};
        const clocks = {};
        for (const key of Object.keys(op.patch)) {
          previousPatch[key] = block.props[key];
          clocks[key] = this._clock.tick();
          this._fieldClocks.recordLocal(op.id, `props.${key}`, clocks[key]);
        }
        this.blocks.set(op.id, { ...block, props: { ...block.props, ...op.patch } });
        this._lastEnvelope = { kind: 'fieldWrite', target: 'blockProps', id: op.id, patch: op.patch, clocks };
        this._notify([op.id]);
        return updateBlockProps(op.id, previousPatch);
      }

      case OP.CHANGE_BLOCK_TYPE: {
        const block = this.blocks.get(op.id);
        const previousType = block.type;
        const previousProps = block.props;
        const clock = this._clock.tick();
        this._fieldClocks.recordLocal(op.id, 'type', clock);
        this.blocks.set(op.id, { ...block, type: op.blockType, props: op.props });
        this._lastEnvelope = { kind: 'fieldWrite', target: 'blockType', id: op.id, blockType: op.blockType, props: op.props, clock };
        this._notify([op.id]);
        return changeBlockType(op.id, previousType, previousProps);
      }

      case OP.INSERT_BLOCK: {
        if (op.subtree) {
          for (const b of op.subtree.blocks) this.blocks.set(b.id, b);
          for (const r of op.subtree.runs) this.runs.set(r.id, r);
        } else {
          this.blocks.set(op.block.id, op.block);
        }
        const parent = this.blocks.get(op.parentId);
        const order = this._getOrder(op.parentId);
        if (order.has(op.block.id)) {
          // Already has a slot here (undo of a REMOVE_BLOCK, or duplicate
          // delivery) -- restore its original position instead of trying
          // to create a second slot for the same id.
          order.restore(op.block.id);
        } else {
          const currentArray = order.toArray();
          const index = op.index ?? currentArray.length;
          const afterId = index > 0 ? currentArray[index - 1] : null;
          order.insert(op.block.id, afterId, this._clock.tick(), this._peerId);
        }
        this.blocks.set(op.parentId, { ...parent, contentIds: order.toArray() });
        this._lastEnvelope = {
          kind: 'insertSlot',
          parentId: op.parentId,
          blockId: op.block.id,
          slot: order.getSlot(op.block.id),
          subtree: op.subtree ?? { blocks: [op.block], runs: [] },
        };
        this._notify([op.block.id, op.parentId]);
        return removeBlock(op.block.id);
      }

      case OP.REMOVE_BLOCK: {
        const target = this.blocks.get(op.id);
        const parentId = target.parentId;
        const parent = this.blocks.get(parentId);
        const order = this._getOrder(parentId);
        const index = order.toArray().indexOf(op.id);
        const subtree = this._captureSubtree(op.id);
        this._deleteSubtree(op.id);
        order.delete(op.id);
        this.blocks.set(parentId, { ...parent, contentIds: order.toArray() });
        this._lastEnvelope = { kind: 'deleteSlot', parentId, blockId: op.id };
        this._notify([parentId]);
        return { type: OP.INSERT_BLOCK, block: target, parentId, index, subtree };
      }

      case OP.MOVE_BLOCK: {
        const target = this.blocks.get(op.id);
        const fromParentId = target.parentId;
        const fromOrder = this._getOrder(fromParentId);
        const fromIndex = fromOrder.toArray().indexOf(op.id);

        // Tombstone the slot at its old position first -- for a
        // same-parent reorder this is the SAME ListCrdtState as toOrder
        // below, and the array it produces afterward is what toIndex is
        // interpreted against (matches the original index-based
        // contract, where toIndex already meant "position in the
        // resulting list").
        fromOrder.delete(op.id);
        this.blocks.set(fromParentId, { ...this.blocks.get(fromParentId), contentIds: fromOrder.toArray() });

        const toOrder = this._getOrder(op.toParentId);
        const toArray = toOrder.toArray();
        const toIndex = op.toIndex ?? toArray.length;
        const afterId = toIndex > 0 ? toArray[toIndex - 1] : null;
        const ts = this._clock.tick();
        if (toOrder.has(op.id)) {
          // Reposition the existing slot (same-parent reorder, or moving
          // back to a parent this id was in — and tombstoned — before).
          toOrder.move(op.id, afterId, ts, this._peerId);
        } else {
          toOrder.insert(op.id, afterId, ts, this._peerId);
        }
        this.blocks.set(op.toParentId, { ...this.blocks.get(op.toParentId), contentIds: toOrder.toArray() });

        this.blocks.set(op.id, { ...this.blocks.get(op.id), parentId: op.toParentId });

        this._lastEnvelope = {
          kind: 'moveSlot',
          fromParentId,
          toParentId: op.toParentId,
          blockId: op.id,
          slot: toOrder.getSlot(op.id),
        };
        const touched = new Set([op.id, fromParentId, op.toParentId]);
        this._notify(touched);
        return moveBlock(op.id, fromParentId, fromIndex);
      }

      case OP.SET_BLOCK_CONTENT_IDS: {
        const block = this.blocks.get(op.blockId);
        const previousContentIds = block.contentIds;
        this.blocks.set(op.blockId, { ...block, contentIds: op.contentIds });
        // This op wholesale-replaces the array (a resync escape hatch, not
        // an incremental edit) -- reseed the ordering CRDT to match rather
        // than leave it stale relative to the new authoritative contents.
        this._orders.set(op.blockId, ListCrdtState.fromArray(op.contentIds, { peerId: 'legacy' }));
        this._lastEnvelope = null; // no CRDT-safe wire representation for a wholesale resync -- not broadcastable in Phase C
        this._notify([op.blockId]);
        return setBlockContentIds(op.blockId, previousContentIds);
      }

      case OP.REPLACE_RUN_SPAN: {
        const block = this.blocks.get(op.blockId);
        // The run span lives in contentIds for a plain leaf block (paragraph,
        // heading, tableCell), or in props.titleRunIds for a listItem (whose
        // contentIds instead holds nested child list items).
        const inContentIds = block.contentIds.indexOf(op.oldRunIds[0]) !== -1;
        const sourceArray = inContentIds ? block.contentIds : block.props?.titleRunIds ?? [];
        const startIndex = sourceArray.indexOf(op.oldRunIds[0]);

        const removedRuns = op.oldRunIds.map((id) => this.runs.get(id));
        for (const id of op.oldRunIds) this.runs.delete(id);
        for (const r of op.newRuns) this.runs.set(r.id, r);

        const newArray = [...sourceArray];
        newArray.splice(startIndex, op.oldRunIds.length, ...op.newRuns.map((r) => r.id));

        if (inContentIds) {
          this.blocks.set(op.blockId, { ...block, contentIds: newArray });
        } else {
          this.blocks.set(op.blockId, { ...block, props: { ...block.props, titleRunIds: newArray } });
        }
        this._lastEnvelope = null; // no CRDT-safe wire representation yet -- not broadcastable in Phase C
        this._notify([op.blockId, ...op.oldRunIds, ...op.newRuns.map((r) => r.id)]);
        return replaceRunSpan(
          op.blockId,
          op.newRuns.map((r) => r.id),
          removedRuns,
        );
      }

      case OP.SET_BLOCK_RUNS: {
        const block = this.blocks.get(op.blockId);
        // Same dual-path convention as REPLACE_RUN_SPAN: a listItem's own
        // runs live in props.titleRunIds (contentIds holds nested child
        // items instead); every other run-bearing leaf uses contentIds.
        const usesTitleRunIds = block.props && 'titleRunIds' in block.props;
        const previousRunIds = usesTitleRunIds ? block.props.titleRunIds : block.contentIds;
        const previousRuns = previousRunIds.map((id) => this.runs.get(id)).filter(Boolean);

        for (const id of previousRunIds) this.runs.delete(id);
        for (const r of op.runs) this.runs.set(r.id, r);
        const newRunIds = op.runs.map((r) => r.id);

        if (usesTitleRunIds) {
          this.blocks.set(op.blockId, { ...block, props: { ...block.props, titleRunIds: newRunIds } });
        } else {
          this.blocks.set(op.blockId, { ...block, contentIds: newRunIds });
        }
        this._lastEnvelope = null; // no CRDT-safe wire representation yet -- not broadcastable in Phase C
        this._notify([op.blockId, ...previousRunIds, ...newRunIds]);
        return setBlockRuns(op.blockId, previousRuns);
      }

      case OP.ADD_FIELD_TYPE: {
        this.fieldTypes.set(op.fieldType.id, op.fieldType);
        this._fieldTypesSnapshot = null;
        this._notify([FIELD_TYPES_KEY]);
        return removeFieldType(op.fieldType.id);
      }

      case OP.UPDATE_FIELD_TYPE: {
        const existing = this.fieldTypes.get(op.id);
        const previousPatch = {};
        for (const key of Object.keys(op.patch)) previousPatch[key] = existing[key];
        this.fieldTypes.set(op.id, { ...existing, ...op.patch });
        this._fieldTypesSnapshot = null;
        this._notify([FIELD_TYPES_KEY]);
        return updateFieldType(op.id, previousPatch);
      }

      case OP.REMOVE_FIELD_TYPE: {
        const existing = this.fieldTypes.get(op.id);
        this.fieldTypes.delete(op.id);
        this._fieldTypesSnapshot = null;
        this._notify([FIELD_TYPES_KEY]);
        return addFieldType(existing);
      }

      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  /** Applies a batch as one transaction: all mutations first, one notify pass, one combined inverse list. */
  applyOperations(ops) {
    return ops.map((op) => this.applyOperation(op));
  }

  /**
   * The CRDT-native wire envelope for whatever `applyOperation` just did —
   * read this immediately after each call to broadcast the change to
   * other peers. `null` for op types with no CRDT-safe representation yet
   * (the coarse resync ops: setBlockContentIds/replaceRunSpan/
   * setBlockRuns/fieldType ops) — those remain local-only in this phase.
   */
  getLastEnvelope() {
    return this._lastEnvelope;
  }

  /**
   * Applies a change received from another peer. Deliberately separate
   * from `applyOperation`/`History.perform` — a remote change must never
   * enter the local undo stack (only `perform`/`performBatch` push onto
   * it), so this method is the only way for a remote envelope to reach
   * the store. Idempotent and order-independent per envelope kind: safe
   * to call more than once, or with envelopes arriving out of order.
   */
  applyRemoteOperation(envelope) {
    if (!envelope) return;
    switch (envelope.kind) {
      case 'insertSlot': {
        for (const b of envelope.subtree.blocks) if (!this.blocks.has(b.id)) this.blocks.set(b.id, b);
        for (const r of envelope.subtree.runs) if (!this.runs.has(r.id)) this.runs.set(r.id, r);
        const order = this._getOrder(envelope.parentId);
        order.merge([envelope.slot]);
        const parent = this.blocks.get(envelope.parentId);
        this.blocks.set(envelope.parentId, { ...parent, contentIds: order.toArray() });
        this._clock.receive(envelope.slot.clock);
        this._notify([envelope.blockId, envelope.parentId]);
        return;
      }

      case 'deleteSlot': {
        const order = this._getOrder(envelope.parentId);
        if (this.blocks.has(envelope.blockId)) this._deleteSubtree(envelope.blockId);
        order.delete(envelope.blockId);
        const parent = this.blocks.get(envelope.parentId);
        this.blocks.set(envelope.parentId, { ...parent, contentIds: order.toArray() });
        this._notify([envelope.parentId]);
        return;
      }

      case 'moveSlot': {
        const fromOrder = this._getOrder(envelope.fromParentId);
        fromOrder.delete(envelope.blockId);
        this.blocks.set(envelope.fromParentId, { ...this.blocks.get(envelope.fromParentId), contentIds: fromOrder.toArray() });

        const toOrder = this._getOrder(envelope.toParentId);
        const hadSlot = toOrder.has(envelope.blockId);
        toOrder.merge([envelope.slot]);
        // merge() only creates a slot or un-deletes one — it never
        // repositions an existing slot (that's not what merging two
        // independently-evolved lists means). A remote MOVE needs the
        // actual reposition, applied only when the slot already existed
        // here before this merge.
        if (hadSlot) toOrder.move(envelope.blockId, envelope.slot.originId, envelope.slot.clock, envelope.slot.peerId);
        this.blocks.set(envelope.toParentId, { ...this.blocks.get(envelope.toParentId), contentIds: toOrder.toArray() });

        if (this.blocks.has(envelope.blockId)) {
          this.blocks.set(envelope.blockId, { ...this.blocks.get(envelope.blockId), parentId: envelope.toParentId });
        }
        this._clock.receive(envelope.slot.clock);
        this._notify([envelope.blockId, envelope.fromParentId, envelope.toParentId]);
        return;
      }

      case 'fieldWrite': {
        if (envelope.target === 'run') {
          const run = this.runs.get(envelope.id);
          if (run) {
            const patch = {};
            for (const key of Object.keys(envelope.patch)) {
              const remoteClock = envelope.clocks[key];
              if (!this._fieldClocks.shouldApplyRemote(envelope.id, key, remoteClock)) continue;
              patch[key] = envelope.patch[key];
              this._fieldClocks.recordRemote(envelope.id, key, remoteClock);
            }
            if (Object.keys(patch).length > 0) {
              this.runs.set(envelope.id, { ...run, ...patch });
              this._notify([envelope.id]);
            }
          }
        } else if (envelope.target === 'blockProps') {
          const block = this.blocks.get(envelope.id);
          if (block) {
            const patch = {};
            for (const key of Object.keys(envelope.patch)) {
              const remoteClock = envelope.clocks[key];
              if (!this._fieldClocks.shouldApplyRemote(envelope.id, `props.${key}`, remoteClock)) continue;
              patch[key] = envelope.patch[key];
              this._fieldClocks.recordRemote(envelope.id, `props.${key}`, remoteClock);
            }
            if (Object.keys(patch).length > 0) {
              this.blocks.set(envelope.id, { ...block, props: { ...block.props, ...patch } });
              this._notify([envelope.id]);
            }
          }
        } else if (envelope.target === 'blockType') {
          const block = this.blocks.get(envelope.id);
          if (block && this._fieldClocks.shouldApplyRemote(envelope.id, 'type', envelope.clock)) {
            this._fieldClocks.recordRemote(envelope.id, 'type', envelope.clock);
            this.blocks.set(envelope.id, { ...block, type: envelope.blockType, props: envelope.props });
            this._notify([envelope.id]);
          }
        }
        for (const ts of Object.values(envelope.clocks ?? {})) this._clock.receive(ts);
        if (envelope.clock) this._clock.receive(envelope.clock);
        return;
      }

      default:
        throw new Error(`Unknown remote envelope kind: ${envelope.kind}`);
    }
  }

  toJSON() {
    return {
      blocks: [...this.blocks.values()],
      runs: [...this.runs.values()],
      rootId: this.rootId,
      fieldTypes: [...this.fieldTypes.values()],
    };
  }

  static fromJSON(doc) {
    return new EditorStore(doc);
  }
}
