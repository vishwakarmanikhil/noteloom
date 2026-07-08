const IDLE_MS = 500;

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
  constructor(store, { idleMs = IDLE_MS } = {}) {
    this.store = store;
    this.idleMs = idleMs;
    this.undoStack = [];
    this.redoStack = [];
    this.currentBatch = null;
    this.idleTimer = null;
    this.historyLog = [];
    this._listeners = new Set();
    this._undoRedoSnapshot = { canUndo: false, canRedo: false };
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

  subscribe(id, listener) {
    return this.store.subscribe(id, listener);
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
      inverses.unshift(this.store.applyOperation(op));
      this.historyLog.push({ opType: op.type, id: op.id ?? op.blockId ?? op.block?.id, actorId, timestamp });
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
    this._notify();
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const op of entry.ops) this.store.applyOperation(op);
    this.undoStack.push(entry);
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
