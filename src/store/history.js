const IDLE_MS = 500;

/**
 * Finds the boundaries of the differing region between an old and new
 * string via common-prefix/common-suffix trimming — e.g. "hello" ->
 * "hello!" gives {beforeOffset: 5, afterOffset: 6} (the edit happened right
 * at the end); "hello" -> "helXlo" gives {beforeOffset: 3, afterOffset: 4}
 * (caret was at 3 before typing "X", ends up at 4 after). Used to recover
 * exactly where the caret was/ended up around a single text-run edit,
 * purely from the op's before/after values — no DOM read needed (which
 * matters because by the time an updateRun op reaches History, the browser
 * has usually already mutated the DOM for that keystroke, so a live
 * `window.getSelection()` read at record-time would already reflect the
 * *post*-edit caret, not the pre-edit one this needs for undo).
 */
function diffValueOffsets(oldValue, newValue) {
  const a = oldValue ?? '';
  const b = newValue ?? '';
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  return { beforeOffset: endA, afterOffset: endB };
}

/**
 * Recovers the caret {runId, beforeOffset, afterOffset} for an undo entry,
 * when it's cleanly expressible as one text-run edit (an ordinary typing
 * batch, or a lone updateRun step) — returns null for anything else
 * (structural batches, non-text runs), which callers treat as "don't move
 * focus", same as today's behavior.
 */
function computeEntrySelection(entry) {
  if (!entry.ops.length || !entry.inverses.length) return null;
  const firstOp = entry.ops[0];
  const lastOp = entry.ops[entry.ops.length - 1];
  if (firstOp.type !== 'updateRun' || lastOp.type !== 'updateRun' || firstOp.id !== lastOp.id) return null;
  if (typeof lastOp.patch?.value !== 'string') return null;

  // inverses are unshifted (most-recent-first), so the last element is the
  // inverse of the *first* op — the run's value before the whole batch.
  const oldestInverse = entry.inverses[entry.inverses.length - 1];
  if (oldestInverse?.type !== 'updateRun' || typeof oldestInverse.patch?.value !== 'string') return null;

  const { beforeOffset, afterOffset } = diffValueOffsets(oldestInverse.patch.value, lastOp.patch.value);
  return { runId: firstOp.id, beforeOffset, afterOffset };
}

/**
 * Structural ops (insert/remove/move block, setBlockContentIds,
 * updateBlockProps, ...) don't reduce to one clean run+offset the way a
 * text edit does, but every op shape here carries *some* id that names the
 * block it touched — block.id (insertBlock/its inverse), blockId
 * (setBlockContentIds/replaceRunSpan/setBlockRuns), id (removeBlock/
 * moveBlock/updateBlockProps — also a run id for updateRun, harmless here
 * since a plain-text-edit entry never reaches this function in the first
 * place; computeEntrySelection already handles that case), and
 * parentId/toParentId as a fallback anchor for when the primary block no
 * longer exists (e.g. after redoing a delete). Collected in that order
 * (most-specific first) so callers can walk the list and focus whichever
 * id is the first one that still resolves to a real block post-undo/redo.
 */
function extractAffectedBlockIds(entry) {
  const ids = [];
  const collect = (op) => {
    if (!op) return;
    if (op.block?.id) ids.push(op.block.id);
    if (op.blockId) ids.push(op.blockId);
    if (op.id) ids.push(op.id);
    if (op.parentId) ids.push(op.parentId);
    if (op.toParentId) ids.push(op.toParentId);
  };
  for (const op of entry.ops) collect(op);
  for (const inverse of entry.inverses) collect(inverse);
  return [...new Set(ids)];
}

/**
 * Wraps an EditorStore with operation-based undo/redo and an audit log.
 *
 * Exposes the exact same read/write surface as EditorStore (getBlock,
 * getRun, getRootId, subscribe, applyOperation, toJSON) so any component
 * written against a plain store works unchanged when given a History
 * instance instead — `applyOperation` here just also records the inverse
 * before delegating to the store.
 *
 * Undo/redo replay inverse/forward operations directly (no full-document
 * snapshot). Rapid edits to the same run coalesce into one undo step via a
 * short idle timeout and a word-boundary heuristic; structural operations
 * (insert/remove/move block) never coalesce, each is its own undo step.
 * Every batch carries {actorId, timestamp}, which is also what backs the
 * audit log (`getHistoryLog`) — a bounded undo/redo stack and an unbounded
 * audit log are deliberately kept separate, since undoing/redoing should
 * not erase "who changed what, when".
 */
export class History {
  constructor(store, { idleMs = IDLE_MS, trackChanges = false, maxChangeLogSize = 500 } = {}) {
    this.store = store;
    this.idleMs = idleMs;
    this.undoStack = [];
    this.redoStack = [];
    this.currentBatch = null;
    this.idleTimer = null;
    this.historyLog = [];
    this._listeners = new Set();
    this._undoRedoSnapshot = { canUndo: false, canRedo: false };
    this._pendingSelection = null;
    this._pendingAffectedBlockIds = [];
    // Opt-in, capped "what changed, from what to what" log — separate from
    // historyLog (which is just {opType, id, actorId, timestamp}, always
    // on) because storing actual before/after values has a real per-edit
    // memory cost. Off by default so it costs nothing for apps that never
    // ask for it; ring-buffered at maxChangeLogSize so a long session can't
    // grow it unbounded even with tracking on.
    this.trackChanges = trackChanges;
    this.maxChangeLogSize = maxChangeLogSize;
    this.changeLog = [];
  }

  /**
   * Appends one entry to the opt-in change log (see `trackChanges`) and
   * drops the oldest entry once over maxChangeLogSize. Only records actual
   * before/after *values* for updateRun/updateBlockProps — both carry a
   * small `patch` object on the op and its inverse already, so the diff is
   * free to capture. Structural ops (insert/remove/move block, ...) are
   * logged as the bare fact (opType/id/actorId/timestamp, before/after
   * left undefined) rather than snapshotting a whole block subtree, which
   * would defeat the point of keeping this lightweight.
   */
  _recordChange(op, inverse, meta) {
    if (!this.trackChanges) return;
    const hasPatch = op.patch !== undefined && inverse?.patch !== undefined;
    this.changeLog.push({
      opType: op.type,
      id: op.id ?? op.blockId ?? op.block?.id,
      before: hasPatch ? inverse.patch : undefined,
      after: hasPatch ? op.patch : undefined,
      actorId: meta.actorId ?? null,
      timestamp: meta.timestamp ?? Date.now(),
    });
    if (this.changeLog.length > this.maxChangeLogSize) this.changeLog.shift();
  }

  /**
   * The opt-in change log (empty unless constructed with trackChanges:
   * true) — one entry per operation as it was originally applied, each
   * `{opType, id, before, after, actorId, timestamp}`. Same
   * independent-of-undo/redo convention as getHistoryLog: undoing an edit
   * doesn't erase or rewrite its original log entry.
   */
  getChangeLog() {
    return [...this.changeLog];
  }

  /**
   * Where the caret should move to after the undo/redo that was just
   * performed — {runId, offset}, or null when the entry wasn't a plain
   * text-run edit (structural ops) or carried no derivable caret. Read this
   * right after calling undo()/redo(); it's overwritten by the next call.
   */
  getPendingSelection() {
    return this._pendingSelection;
  }

  /**
   * Fallback for structural entries where getPendingSelection() is null —
   * ids (most-specific first) of blocks the just-undone/redone entry
   * touched, so a caller can focus the first one that still exists rather
   * than leaving focus wherever it happened to be (typically stale, since a
   * removed/re-inserted block is a brand-new DOM node). See
   * extractAffectedBlockIds for exactly what's collected.
   */
  getPendingAffectedBlockIds() {
    return this._pendingAffectedBlockIds;
  }

  /**
   * Cached {canUndo, canRedo} snapshot — only a new object when either value
   * actually changed, so useSyncExternalStore's getSnapshot can call this
   * every render without ever seeing a "changed" reference for no reason.
   */
  getUndoRedoSnapshot() {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    if (this._undoRedoSnapshot.canUndo !== canUndo || this._undoRedoSnapshot.canRedo !== canRedo) {
      this._undoRedoSnapshot = { canUndo, canRedo };
    }
    return this._undoRedoSnapshot;
  }

  // --- read surface: delegate straight through ---
  getBlock(id) {
    return this.store.getBlock(id);
  }

  getRun(id) {
    return this.store.getRun(id);
  }

  getRootId() {
    return this.store.getRootId();
  }

  getFieldTypes() {
    return this.store.getFieldTypes();
  }

  getFieldType(id) {
    return this.store.getFieldType(id);
  }

  subscribe(id, listener) {
    return this.store.subscribe(id, listener);
  }

  subscribeAll(listener) {
    return this.store.subscribeAll(listener);
  }

  toJSON() {
    return this.store.toJSON();
  }

  // --- write surface ---
  applyOperation(op, meta = {}) {
    return this.perform(op, meta);
  }

  applyOperations(ops, meta = {}) {
    return ops.map((op) => this.perform(op, meta));
  }

  /**
   * Applies several operations as one atomic undo step (e.g. merging a
   * block into its previous sibling is remove-empty-block + reassign-
   * contentIds + delete-shell — three ops that must undo together, not one
   * press per op). Flushes any in-progress typing batch first so the merge
   * doesn't get folded into unrelated coalescing.
   */
  performBatch(ops, meta = {}) {
    const actorId = meta.actorId ?? null;
    const timestamp = meta.timestamp ?? Date.now();
    this._commitCurrentBatch();

    const inverses = [];
    for (const op of ops) {
      const inverse = this.store.applyOperation(op);
      inverses.unshift(inverse);
      this.historyLog.push({ opType: op.type, id: op.id ?? op.blockId ?? op.block?.id, actorId, timestamp });
      this._recordChange(op, inverse, { actorId, timestamp });
    }

    this.redoStack = [];
    this.undoStack.push({
      ops: [...ops],
      inverses,
      batchKey: null,
      actorId,
      timestamp,
      lastTimestamp: timestamp,
      boundaryHit: true,
    });
    this._notify();
  }

  perform(op, meta = {}) {
    const actorId = meta.actorId ?? null;
    const timestamp = meta.timestamp ?? Date.now();
    const inverse = this.store.applyOperation(op);
    this._record(op, inverse, { actorId, timestamp });
    return inverse;
  }

  _batchKeyFor(op) {
    // Only same-run text edits coalesce; every structural op is its own step.
    return op.type === 'updateRun' ? `run:${op.id}` : null;
  }

  _isWordBoundary(op) {
    if (op.type !== 'updateRun') return false;
    const value = op.patch?.value;
    if (typeof value !== 'string' || value.length === 0) return false;
    return /\s/.test(value[value.length - 1]);
  }

  _record(op, inverse, meta) {
    this.redoStack = [];
    const batchKey = this._batchKeyFor(op);
    const withinIdle = this.currentBatch && meta.timestamp - this.currentBatch.lastTimestamp <= this.idleMs;
    const sameBatch =
      this.currentBatch &&
      batchKey !== null &&
      this.currentBatch.batchKey === batchKey &&
      withinIdle &&
      !this.currentBatch.boundaryHit;

    if (sameBatch) {
      this.currentBatch.ops.push(op);
      this.currentBatch.inverses.unshift(inverse); // undo applies most-recent-first
      this.currentBatch.lastTimestamp = meta.timestamp;
      if (this._isWordBoundary(op)) this.currentBatch.boundaryHit = true;
    } else {
      this._commitCurrentBatch();
      this.currentBatch = {
        ops: [op],
        inverses: [inverse],
        batchKey,
        actorId: meta.actorId,
        timestamp: meta.timestamp,
        lastTimestamp: meta.timestamp,
        boundaryHit: this._isWordBoundary(op),
      };
    }

    this._resetIdleTimer();
    this.historyLog.push({
      opType: op.type,
      id: op.id ?? op.block?.id,
      actorId: meta.actorId,
      timestamp: meta.timestamp,
    });
    this._recordChange(op, inverse, meta);
    this._notify();
  }

  _resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this._commitCurrentBatch();
      this._notify();
    }, this.idleMs);
  }

  _commitCurrentBatch() {
    if (!this.currentBatch) return;
    this.undoStack.push(this.currentBatch);
    this.currentBatch = null;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Force any in-progress coalescing batch to close (e.g. on blur). */
  flush() {
    this._commitCurrentBatch();
    this._notify();
  }

  undo() {
    this._commitCurrentBatch();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const inverse of entry.inverses) this.store.applyOperation(inverse);
    this.redoStack.push(entry);
    const selection = computeEntrySelection(entry);
    this._pendingSelection = selection ? { runId: selection.runId, offset: selection.beforeOffset } : null;
    this._pendingAffectedBlockIds = extractAffectedBlockIds(entry);
    this._notify();
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const op of entry.ops) this.store.applyOperation(op);
    this.undoStack.push(entry);
    const selection = computeEntrySelection(entry);
    this._pendingSelection = selection ? { runId: selection.runId, offset: selection.afterOffset } : null;
    this._pendingAffectedBlockIds = extractAffectedBlockIds(entry);
    this._notify();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0 || this.currentBatch !== null;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /** Unbounded (never popped by undo/redo) who/when/what audit trail. */
  getHistoryLog() {
    return [...this.historyLog];
  }

  subscribeToHistory(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    for (const listener of this._listeners) listener();
  }
}
