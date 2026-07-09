import {
  OP,
  insertBlock,
  removeBlock,
  moveBlock,
  updateBlockProps,
  updateRun,
  setBlockContentIds,
  replaceRunSpan,
  setBlockRuns,
  addFieldType,
  updateFieldType,
  removeFieldType,
} from './operations.js';

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

  _notify(touchedIds) {
    for (const id of touchedIds) {
      const set = this._listeners.get(id);
      if (!set) continue;
      // copy before iterating: a listener may unsubscribe during notification
      for (const listener of [...set]) listener();
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
        for (const key of Object.keys(op.patch)) previousPatch[key] = run[key];
        this.runs.set(op.id, { ...run, ...op.patch });
        this._notify([op.id]);
        return updateRun(op.id, previousPatch);
      }

      case OP.UPDATE_BLOCK_PROPS: {
        const block = this.blocks.get(op.id);
        const previousPatch = {};
        for (const key of Object.keys(op.patch)) previousPatch[key] = block.props[key];
        this.blocks.set(op.id, { ...block, props: { ...block.props, ...op.patch } });
        this._notify([op.id]);
        return updateBlockProps(op.id, previousPatch);
      }

      case OP.INSERT_BLOCK: {
        if (op.subtree) {
          for (const b of op.subtree.blocks) this.blocks.set(b.id, b);
          for (const r of op.subtree.runs) this.runs.set(r.id, r);
        } else {
          this.blocks.set(op.block.id, op.block);
        }
        const parent = this.blocks.get(op.parentId);
        const newContentIds = [...parent.contentIds];
        const index = op.index ?? newContentIds.length;
        newContentIds.splice(index, 0, op.block.id);
        this.blocks.set(op.parentId, { ...parent, contentIds: newContentIds });
        this._notify([op.block.id, op.parentId]);
        return removeBlock(op.block.id);
      }

      case OP.REMOVE_BLOCK: {
        const target = this.blocks.get(op.id);
        const parentId = target.parentId;
        const parent = this.blocks.get(parentId);
        const index = parent.contentIds.indexOf(op.id);
        const subtree = this._captureSubtree(op.id);
        this._deleteSubtree(op.id);
        const newContentIds = parent.contentIds.filter((cid) => cid !== op.id);
        this.blocks.set(parentId, { ...parent, contentIds: newContentIds });
        this._notify([parentId]);
        return { type: OP.INSERT_BLOCK, block: target, parentId, index, subtree };
      }

      case OP.MOVE_BLOCK: {
        const target = this.blocks.get(op.id);
        const fromParentId = target.parentId;
        const fromParent = this.blocks.get(fromParentId);
        const fromIndex = fromParent.contentIds.indexOf(op.id);

        const trimmedFromContentIds = fromParent.contentIds.filter((cid) => cid !== op.id);
        this.blocks.set(fromParentId, { ...fromParent, contentIds: trimmedFromContentIds });

        const toParent =
          op.toParentId === fromParentId
            ? this.blocks.get(fromParentId)
            : this.blocks.get(op.toParentId);
        const newToContentIds = [...toParent.contentIds];
        newToContentIds.splice(op.toIndex ?? newToContentIds.length, 0, op.id);
        this.blocks.set(op.toParentId, { ...toParent, contentIds: newToContentIds });

        this.blocks.set(op.id, { ...this.blocks.get(op.id), parentId: op.toParentId });

        const touched = new Set([op.id, fromParentId, op.toParentId]);
        this._notify(touched);
        return moveBlock(op.id, fromParentId, fromIndex);
      }

      case OP.SET_BLOCK_CONTENT_IDS: {
        const block = this.blocks.get(op.blockId);
        const previousContentIds = block.contentIds;
        this.blocks.set(op.blockId, { ...block, contentIds: op.contentIds });
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
