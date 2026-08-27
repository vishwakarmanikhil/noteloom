import {
  OP,
  insertBlock,
  removeBlock,
  moveBlock,
  changeBlockType,
  updateBlockProps,
  updateRun,
  editRunChars,
  setBlockContentIds,
  replaceRunSpan,
  setBlockRuns,
  addFieldType,
  updateFieldType,
  removeFieldType,
  addCommentThread,
  removeCommentThread,
  addCommentReply,
  removeCommentReply,
  resolveComment,
  addPerson,
  updatePerson,
  removePerson,
} from './operations.js';
import { ListCrdtState } from '../crdt/listCrdt.js';
import { HLC, genPeerId } from '../crdt/clock.js';
import { FieldClockRegistry } from '../crdt/fieldRegistry.js';
import { diffCodePoints } from '../crdt/textDiff.js';
import { genId } from '../utils/idGen.js';

/** Sentinel subscribe/notify key for "the fieldTypes collection changed" — see useFieldTypes. */
const FIELD_TYPES_KEY = '$fieldTypes';

/** Sentinel subscribe/notify key for "the comments collection changed" — see useComments. */
const COMMENTS_KEY = '$comments';

/** Sentinel subscribe/notify key for "the document's people list changed" — see usePeople. */
const PEOPLE_KEY = '$people';

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
    this.comments = new Map((doc?.comments ?? []).map((c) => [c.id, c]));
    this._commentsSnapshot = null; // invalidated (set to null) on every comments mutation — see getComments
    this.people = new Map((doc?.people ?? []).map((p) => [p.id, p]));
    this._peopleSnapshot = null; // invalidated (set to null) on every people mutation — see getPeople
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

    // Character-level text merge state — same lazy-seed-from-existing-data
    // relationship to `runs` that `_orders` has to `blocks`. `_runOrders`
    // orders a run's characters (ListCrdtState is fully generic over
    // whatever ids it's given, so it's reused as-is here, just one
    // instance per RUN instead of per parent BLOCK); `_runChars` holds the
    // actual character payload for each slot (ListCrdtState's slots carry
    // no value of their own); `_runValueSnapshots` memoizes the
    // materialized string per run (see _materializeRunValue), the same
    // invalidate-on-mutation convention `getFieldTypes()` already uses for
    // `_fieldTypesSnapshot`.
    this._runOrders = new Map();
    this._runChars = new Map();
    this._runValueSnapshots = new Map();
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

  /**
   * Lazily seeds a run's character-ordering CRDT state from its current
   * (plain-string) value the first time it's touched. Unlike blocks,
   * individual characters have no pre-existing stable id of their own —
   * BUT a fresh *random* one (genId()) can't be minted here the way
   * `_getRunOrder`'s block equivalent doesn't need to, because a block's
   * seed ids (its real `.id`s) are already identical on every peer (the
   * document itself was already synced); a run's *characters* aren't
   * separately synced at all, only its plain `value` string is. Two peers
   * independently lazy-seeding the same pre-existing text with random ids
   * would each invent a DIFFERENT id for "the same" character, so a
   * remote edit's `afterId` (anchored to the sender's random id) would
   * never resolve on the receiving side. Fix: ids for this initial seed
   * are DETERMINISTIC — `` `${runId}:legacyChar:${index}` `` — so any peer
   * seeding from the same starting string (guaranteed, since a peer only
   * ever needs to seed a run it has already received the full document
   * for) always mints the identical ids independently, with no
   * coordination required. Only ever used for this one-time seed; every
   * character inserted after that (by typing, on any peer) gets a real
   * `genId()`.
   */
  _getRunOrder(runId) {
    let order = this._runOrders.get(runId);
    if (!order) {
      const run = this.runs.get(runId);
      const chars = new Map();
      order = new ListCrdtState();
      let prev = null;
      let index = 0;
      for (const ch of Array.from(run?.value ?? '')) {
        const charId = `${runId}:legacyChar:${index}`;
        chars.set(charId, ch);
        order.insert(charId, prev, { wallTime: 0, counter: 0, peerId: 'legacy' }, 'legacy');
        prev = charId;
        index += 1;
      }
      this._runOrders.set(runId, order);
      this._runChars.set(runId, chars);
    }
    return order;
  }

  /** Materializes a run's current text from its character CRDT, memoized until that run's char order next changes. */
  _materializeRunValue(runId) {
    let value = this._runValueSnapshots.get(runId);
    if (value === undefined) {
      const order = this._getRunOrder(runId);
      const chars = this._runChars.get(runId);
      value = order
        .toArray()
        .map((charId) => chars.get(charId))
        .join('');
      this._runValueSnapshots.set(runId, value);
    }
    return value;
  }

  /**
   * Diffs `newValue` against the run's current materialized value (common
   * prefix/suffix, code-point aware — see diffCodePoints) and translates
   * only the changed region into character-CRDT insert/delete ops. One
   * shared clock covers the whole edit — matching how a single
   * INSERT_BLOCK/REMOVE_BLOCK op already uses one tick() each — since
   * these characters are never independently reordered relative to each
   * other regardless of how many ticks they'd otherwise get.
   */
  _editRunText(runId, newValue) {
    const oldValue = this._materializeRunValue(runId);
    const { start, oldEnd, newEnd, newChars } = diffCodePoints(oldValue, newValue);
    const order = this._getRunOrder(runId);
    const chars = this._runChars.get(runId);
    const currentIds = order.toArray();
    const clock = this._clock.tick();

    const deletedCharIds = [];
    for (let i = start; i < oldEnd; i += 1) {
      const id = currentIds[i];
      order.delete(id, clock);
      deletedCharIds.push({ id, clock });
    }

    const insertedChars = [];
    let afterId = start > 0 ? currentIds[start - 1] : null;
    for (let i = start; i < newEnd; i += 1) {
      const id = genId();
      const ch = newChars[i];
      chars.set(id, ch);
      order.insert(id, afterId, clock, this._peerId);
      insertedChars.push({ id, char: ch, afterId, clock });
      afterId = id;
    }

    this._runValueSnapshots.delete(runId);
    return { oldValue, insertedChars, deletedCharIds, clock };
  }

  /**
   * Replays a previously-resolved text edit's EXACT character ids (from
   * `op._charEdit`, cached on first application — see the UPDATE_RUN case)
   * instead of re-diffing and minting fresh ones. Needed for `History`'s
   * redo, which replays the same op OBJECT a second time: re-diffing would
   * mint a brand-new set of ids rather than restoring the ones the
   * matching undo had only tombstoned, breaking a subsequent undo/redo
   * cycle (mirrors how INSERT_BLOCK's own handler restores an existing
   * slot via `order.restore()` on redo instead of creating a new one,
   * since a block's id is already stable across replay — characters have
   * no such built-in stable id, so this cache is what gives them one).
   */
  _replayRunTextEdit(runId, charEdit) {
    const order = this._getRunOrder(runId);
    const chars = this._runChars.get(runId);
    for (const c of charEdit.insertedChars) {
      if (order.has(c.id)) order.restore(c.id);
      else {
        chars.set(c.id, c.char);
        order.insert(c.id, c.afterId, c.clock, this._peerId);
      }
    }
    for (const d of charEdit.deletedCharIds) order.delete(d.id, d.clock);
    this._runValueSnapshots.delete(runId);
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

  /**
   * Every comment thread — insertion order. Returns the SAME array
   * reference across calls unless a comments op ran in between — required
   * for useSyncExternalStore (see useComments), same contract as
   * getFieldTypes.
   */
  getComments() {
    if (!this._commentsSnapshot) this._commentsSnapshot = [...this.comments.values()];
    return this._commentsSnapshot;
  }

  getComment(id) {
    return this.comments.get(id);
  }

  /**
   * The document's own people list (see src/people/people.js's addPerson —
   * the documented entry point, and createSelectFieldType's "Assignee"
   * usage, which sources its options from this instead of any device-local
   * list, so every collaborator on the same document sees the same
   * assignable people). Same reference-stability contract as getFieldTypes/
   * getComments — required for useSyncExternalStore (see usePeople).
   */
  getPeople() {
    if (!this._peopleSnapshot) this._peopleSnapshot = [...this.people.values()];
    return this._peopleSnapshot;
  }

  getPerson(id) {
    return this.people.get(id);
  }

  /**
   * Every run id in the whole document, regardless of reachability from
   * the root — used by removeCommentMarkEverywhere (see
   * src/comments/commentMarks.js) to strip a deleted comment's id from
   * any run that still carries it, without needing a separate index.
   */
  getAllRunIds() {
    return [...this.runs.keys()];
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
        const patchKeys = Object.keys(op.patch);

        // The overwhelmingly common (and, per every real call site in this
        // codebase, the ONLY observed) shape: a lone `value` key, from
        // typing. Routed through this run's own character CRDT instead of
        // whole-value LWW, so concurrent edits to the same run interleave
        // instead of one clobbering the other, and undo can precisely
        // reverse only the characters THIS actor touched (via
        // EDIT_RUN_CHARS below) instead of replaying a stale whole-string
        // snapshot that can clobber a peer's concurrent edit. Any other
        // patch shape (marks, an atomic chip's `data`, or — never observed
        // in practice — `value` mixed with another key) keeps the
        // original whole-field LWW path below.
        if (patchKeys.length === 1 && patchKeys[0] === 'value') {
          let charEdit = op._charEdit;
          if (charEdit) {
            this._replayRunTextEdit(op.id, charEdit); // redo: reuse the exact ids from the first application
          } else {
            const { oldValue, insertedChars, deletedCharIds, clock } = this._editRunText(
              op.id,
              op.patch.value,
            );
            charEdit = { oldValue, insertedChars, deletedCharIds, clock };
            op._charEdit = charEdit; // cached on the op object itself so a future redo replays these same ids -- see _replayRunTextEdit
          }
          const newValue = this._materializeRunValue(op.id);
          this.runs.set(op.id, { ...run, value: newValue });
          this._lastEnvelope = {
            kind: 'runTextEdit',
            runId: op.id,
            insertedChars: charEdit.insertedChars,
            deletedCharIds: charEdit.deletedCharIds,
            clock: charEdit.clock,
          };
          this._notify([op.id]);
          return editRunChars(
            op.id,
            charEdit.insertedChars.map((c) => c.id), // undo: tombstone what was just inserted...
            charEdit.deletedCharIds.map((c) => c.id), // ...and restore what was just deleted
            charEdit.oldValue, // cosmetic-only, for History's caret restoration/change log -- see editRunChars's own doc comment
          );
        }

        const previousPatch = {};
        const clocks = {};
        for (const key of patchKeys) {
          previousPatch[key] = run[key];
          clocks[key] = this._clock.tick();
          this._fieldClocks.recordLocal(op.id, key, clocks[key]);
        }
        this.runs.set(op.id, { ...run, ...op.patch });
        this._lastEnvelope = {
          kind: 'fieldWrite',
          target: 'run',
          id: op.id,
          patch: op.patch,
          clocks,
        };
        this._notify([op.id]);
        return updateRun(op.id, previousPatch);
      }

      case OP.EDIT_RUN_CHARS: {
        const order = this._getRunOrder(op.id);
        const clock = this._clock.tick();
        for (const charId of op.tombstoneIds) order.delete(charId, clock);
        for (const charId of op.restoreIds) order.restore(charId);
        this._runValueSnapshots.delete(op.id);
        const run = this.runs.get(op.id);
        const newValue = this._materializeRunValue(op.id);
        this.runs.set(op.id, { ...run, value: newValue });
        this._lastEnvelope = {
          kind: 'runCharEdit',
          runId: op.id,
          tombstoneIds: op.tombstoneIds,
          restoreIds: op.restoreIds,
          clock,
        };
        this._notify([op.id]);
        return editRunChars(op.id, op.restoreIds, op.tombstoneIds); // swapped -- this op is its own inverse shape
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
        this._lastEnvelope = {
          kind: 'fieldWrite',
          target: 'blockProps',
          id: op.id,
          patch: op.patch,
          clocks,
        };
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
        this._lastEnvelope = {
          kind: 'fieldWrite',
          target: 'blockType',
          id: op.id,
          blockType: op.blockType,
          props: op.props,
          clock,
        };
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
        const deleteClock = this._clock.tick();
        order.delete(op.id, deleteClock);
        this.blocks.set(parentId, { ...parent, contentIds: order.toArray() });
        this._lastEnvelope = { kind: 'deleteSlot', parentId, blockId: op.id, clock: deleteClock };
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
        fromOrder.delete(op.id, this._clock.tick());
        this.blocks.set(fromParentId, {
          ...this.blocks.get(fromParentId),
          contentIds: fromOrder.toArray(),
        });

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
        this.blocks.set(op.toParentId, {
          ...this.blocks.get(op.toParentId),
          contentIds: toOrder.toArray(),
        });

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
        const sourceArray = inContentIds ? block.contentIds : (block.props?.titleRunIds ?? []);
        const startIndex = sourceArray.indexOf(op.oldRunIds[0]);

        const removedRuns = op.oldRunIds.map((id) => this.runs.get(id));
        for (const id of op.oldRunIds) this.runs.delete(id);
        for (const r of op.newRuns) this.runs.set(r.id, r);

        const newArray = [...sourceArray];
        newArray.splice(startIndex, op.oldRunIds.length, ...op.newRuns.map((r) => r.id));

        if (inContentIds) {
          this.blocks.set(op.blockId, { ...block, contentIds: newArray });
        } else {
          this.blocks.set(op.blockId, {
            ...block,
            props: { ...block.props, titleRunIds: newArray },
          });
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
          this.blocks.set(op.blockId, {
            ...block,
            props: { ...block.props, titleRunIds: newRunIds },
          });
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

      case OP.ADD_COMMENT_THREAD: {
        this.comments.set(op.thread.id, op.thread);
        this._commentsSnapshot = null;
        this._lastEnvelope = { kind: 'commentWrite', op: 'addThread', thread: op.thread };
        this._notify([COMMENTS_KEY]);
        return removeCommentThread(op.thread.id);
      }

      case OP.REMOVE_COMMENT_THREAD: {
        const existing = this.comments.get(op.commentId);
        this.comments.delete(op.commentId);
        this._commentsSnapshot = null;
        this._lastEnvelope = { kind: 'commentWrite', op: 'removeThread', commentId: op.commentId };
        this._notify([COMMENTS_KEY]);
        return addCommentThread(existing);
      }

      case OP.ADD_COMMENT_REPLY: {
        const thread = this.comments.get(op.commentId);
        this.comments.set(op.commentId, { ...thread, messages: [...thread.messages, op.message] });
        this._commentsSnapshot = null;
        this._lastEnvelope = {
          kind: 'commentWrite',
          op: 'addReply',
          commentId: op.commentId,
          message: op.message,
        };
        this._notify([COMMENTS_KEY]);
        return removeCommentReply(op.commentId, op.message.id);
      }

      case OP.REMOVE_COMMENT_REPLY: {
        const thread = this.comments.get(op.commentId);
        const removedMessage = thread.messages.find((m) => m.id === op.messageId);
        this.comments.set(op.commentId, {
          ...thread,
          messages: thread.messages.filter((m) => m.id !== op.messageId),
        });
        this._commentsSnapshot = null;
        this._lastEnvelope = {
          kind: 'commentWrite',
          op: 'removeReply',
          commentId: op.commentId,
          messageId: op.messageId,
        };
        this._notify([COMMENTS_KEY]);
        return addCommentReply(op.commentId, removedMessage);
      }

      case OP.RESOLVE_COMMENT: {
        const thread = this.comments.get(op.commentId);
        const previousResolved = thread.resolved;
        this.comments.set(op.commentId, { ...thread, resolved: op.resolved });
        this._commentsSnapshot = null;
        this._lastEnvelope = {
          kind: 'commentWrite',
          op: 'resolve',
          commentId: op.commentId,
          resolved: op.resolved,
        };
        this._notify([COMMENTS_KEY]);
        return resolveComment(op.commentId, previousResolved);
      }

      case OP.ADD_PERSON: {
        this.people.set(op.person.id, op.person);
        this._peopleSnapshot = null;
        this._lastEnvelope = { kind: 'peopleWrite', op: 'add', person: op.person };
        this._notify([PEOPLE_KEY]);
        return removePerson(op.person.id);
      }

      case OP.UPDATE_PERSON: {
        const existing = this.people.get(op.id);
        const previousPatch = {};
        for (const key of Object.keys(op.patch)) previousPatch[key] = existing[key];
        this.people.set(op.id, { ...existing, ...op.patch });
        this._peopleSnapshot = null;
        this._lastEnvelope = { kind: 'peopleWrite', op: 'update', id: op.id, patch: op.patch };
        this._notify([PEOPLE_KEY]);
        return updatePerson(op.id, previousPatch);
      }

      case OP.REMOVE_PERSON: {
        const existing = this.people.get(op.id);
        this.people.delete(op.id);
        this._peopleSnapshot = null;
        this._lastEnvelope = { kind: 'peopleWrite', op: 'remove', id: op.id };
        this._notify([PEOPLE_KEY]);
        return addPerson(existing);
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
        for (const b of envelope.subtree.blocks)
          if (!this.blocks.has(b.id)) this.blocks.set(b.id, b);
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
        order.delete(envelope.blockId, envelope.clock);
        if (envelope.clock) this._clock.receive(envelope.clock);
        const parent = this.blocks.get(envelope.parentId);
        this.blocks.set(envelope.parentId, { ...parent, contentIds: order.toArray() });
        this._notify([envelope.parentId]);
        return;
      }

      case 'moveSlot': {
        const fromOrder = this._getOrder(envelope.fromParentId);
        // The move's own clock (envelope.slot.clock) is a reasonable proxy
        // for "when the old position was vacated" -- there's no separate
        // timestamp for that specific fact, and it's close enough in time
        // to be a safe (if not perfectly precise) tombstone age.
        fromOrder.delete(envelope.blockId, envelope.slot?.clock);
        this.blocks.set(envelope.fromParentId, {
          ...this.blocks.get(envelope.fromParentId),
          contentIds: fromOrder.toArray(),
        });

        const toOrder = this._getOrder(envelope.toParentId);
        const hadSlot = toOrder.has(envelope.blockId);
        toOrder.merge([envelope.slot]);
        // merge() only creates a slot or un-deletes one — it never
        // repositions an existing slot (that's not what merging two
        // independently-evolved lists means). A remote MOVE needs the
        // actual reposition, applied only when the slot already existed
        // here before this merge.
        if (hadSlot)
          toOrder.move(
            envelope.blockId,
            envelope.slot.originId,
            envelope.slot.clock,
            envelope.slot.peerId,
          );
        this.blocks.set(envelope.toParentId, {
          ...this.blocks.get(envelope.toParentId),
          contentIds: toOrder.toArray(),
        });

        if (this.blocks.has(envelope.blockId)) {
          this.blocks.set(envelope.blockId, {
            ...this.blocks.get(envelope.blockId),
            parentId: envelope.toParentId,
          });
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
              if (!this._fieldClocks.shouldApplyRemote(envelope.id, `props.${key}`, remoteClock))
                continue;
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
            this.blocks.set(envelope.id, {
              ...block,
              type: envelope.blockType,
              props: envelope.props,
            });
            this._notify([envelope.id]);
          }
        }
        for (const ts of Object.values(envelope.clocks ?? {})) this._clock.receive(ts);
        if (envelope.clock) this._clock.receive(envelope.clock);
        return;
      }

      case 'runTextEdit': {
        const order = this._getRunOrder(envelope.runId);
        const chars = this._runChars.get(envelope.runId);
        for (const c of envelope.insertedChars) {
          if (!order.has(c.id)) chars.set(c.id, c.char);
          order.insert(c.id, c.afterId, c.clock, c.clock?.peerId); // idempotent -- safe on duplicate delivery, same as block inserts
        }
        for (const d of envelope.deletedCharIds) order.delete(d.id, d.clock);
        this._runValueSnapshots.delete(envelope.runId);
        const run = this.runs.get(envelope.runId);
        if (run) {
          this.runs.set(envelope.runId, {
            ...run,
            value: this._materializeRunValue(envelope.runId),
          });
          this._notify([envelope.runId]);
        }
        this._clock.receive(envelope.clock);
        return;
      }

      case 'runCharEdit': {
        const order = this._getRunOrder(envelope.runId);
        for (const charId of envelope.tombstoneIds) order.delete(charId, envelope.clock);
        for (const charId of envelope.restoreIds) order.restore(charId);
        this._runValueSnapshots.delete(envelope.runId);
        const run = this.runs.get(envelope.runId);
        if (run) {
          this.runs.set(envelope.runId, {
            ...run,
            value: this._materializeRunValue(envelope.runId),
          });
          this._notify([envelope.runId]);
        }
        this._clock.receive(envelope.clock);
        return;
      }

      case 'commentWrite': {
        // Simple, no-per-field-clock handling -- comment thread metadata
        // sees low write concurrency in practice (see the plan's own
        // rationale), so each sub-kind just applies directly rather than
        // comparing HLC clocks the way run/block field writes do above.
        // Existence checks guard only against out-of-order delivery (e.g.
        // a reply arriving before its thread's own add), not against real
        // conflicts -- a later full resync reconciles anything this misses.
        if (envelope.op === 'addThread') {
          if (!this.comments.has(envelope.thread.id)) {
            this.comments.set(envelope.thread.id, envelope.thread);
            this._commentsSnapshot = null;
            this._notify([COMMENTS_KEY]);
          }
        } else if (envelope.op === 'removeThread') {
          if (this.comments.delete(envelope.commentId)) {
            this._commentsSnapshot = null;
            this._notify([COMMENTS_KEY]);
          }
        } else if (envelope.op === 'addReply') {
          const thread = this.comments.get(envelope.commentId);
          if (thread && !thread.messages.some((m) => m.id === envelope.message.id)) {
            this.comments.set(envelope.commentId, {
              ...thread,
              messages: [...thread.messages, envelope.message],
            });
            this._commentsSnapshot = null;
            this._notify([COMMENTS_KEY]);
          }
        } else if (envelope.op === 'removeReply') {
          const thread = this.comments.get(envelope.commentId);
          if (thread && thread.messages.some((m) => m.id === envelope.messageId)) {
            this.comments.set(envelope.commentId, {
              ...thread,
              messages: thread.messages.filter((m) => m.id !== envelope.messageId),
            });
            this._commentsSnapshot = null;
            this._notify([COMMENTS_KEY]);
          }
        } else if (envelope.op === 'resolve') {
          const thread = this.comments.get(envelope.commentId);
          if (thread) {
            this.comments.set(envelope.commentId, { ...thread, resolved: envelope.resolved });
            this._commentsSnapshot = null;
            this._notify([COMMENTS_KEY]);
          }
        }
        return;
      }

      case 'peopleWrite': {
        // Same simple existence-check merge as commentWrite above, for the
        // same reason: a document's people list sees low write concurrency
        // in practice (adding/renaming/removing a collaborator's name is
        // not something two people do to the same entry at the same
        // instant), so there's no need for the per-field HLC comparison
        // run/block field writes use.
        if (envelope.op === 'add') {
          if (!this.people.has(envelope.person.id)) {
            this.people.set(envelope.person.id, envelope.person);
            this._peopleSnapshot = null;
            this._notify([PEOPLE_KEY]);
          }
        } else if (envelope.op === 'update') {
          const existing = this.people.get(envelope.id);
          if (existing) {
            this.people.set(envelope.id, { ...existing, ...envelope.patch });
            this._peopleSnapshot = null;
            this._notify([PEOPLE_KEY]);
          }
        } else if (envelope.op === 'remove') {
          if (this.people.delete(envelope.id)) {
            this._peopleSnapshot = null;
            this._notify([PEOPLE_KEY]);
          }
        }
        return;
      }

      default:
        throw new Error(`Unknown remote envelope kind: ${envelope.kind}`);
    }
  }

  /** Total tombstoned (deleted but still retained) slots across every parent's ordering CRDT and every run's character CRDT — a cheap signal for whether pruneTombstones() is worth calling, or just for observing growth over a long session. */
  getTombstoneCount() {
    let count = 0;
    for (const order of this._orders.values()) count += order.tombstoneCount();
    for (const order of this._runOrders.values()) count += order.tombstoneCount();
    return count;
  }

  /**
   * Permanently removes tombstones older than `maxAgeMs` (default 24h)
   * across every parent's ordering CRDT — see ListCrdtState.pruneTombstones
   * for the safety argument this relies on (this package's reconnect model
   * always resyncs via a full snapshot, never a replayed op log, which is
   * what makes a time-based threshold safe here specifically). Opt-in:
   * never called automatically by anything in this store — call it
   * yourself on whatever schedule fits (see createPeriodicTombstoneGC for
   * a ready-made "just handle it" helper). Returns the number of slots
   * removed.
   */
  pruneTombstones({ maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now() } = {}) {
    const threshold = { wallTime: now - maxAgeMs, counter: 0, peerId: '' };
    let removed = 0;
    for (const order of this._orders.values()) removed += order.pruneTombstones(threshold);
    // Character payloads for pruned run-char slots (_runChars) are
    // deliberately left in place rather than cleaned up here:
    // ListCrdtState.pruneTombstones only returns a removed *count*, not
    // which ids were removed (a shared contract with the block-level GC
    // above, which has no equivalent payload map to clean), and a few
    // orphaned single-character map entries per prune is a far smaller
    // concern than the whole-subtree leaks tombstone GC exists to prevent
    // in the first place.
    for (const order of this._runOrders.values()) removed += order.pruneTombstones(threshold);
    return removed;
  }

  toJSON() {
    return {
      blocks: [...this.blocks.values()],
      runs: [...this.runs.values()],
      rootId: this.rootId,
      fieldTypes: [...this.fieldTypes.values()],
      comments: [...this.comments.values()],
      people: [...this.people.values()],
    };
  }

  static fromJSON(doc) {
    return new EditorStore(doc);
  }
}
