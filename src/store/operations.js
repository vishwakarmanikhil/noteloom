export const OP = {
  INSERT_BLOCK: 'insertBlock',
  REMOVE_BLOCK: 'removeBlock',
  MOVE_BLOCK: 'moveBlock',
  CHANGE_BLOCK_TYPE: 'changeBlockType',
  UPDATE_BLOCK_PROPS: 'updateBlockProps',
  UPDATE_RUN: 'updateRun',
  SET_BLOCK_CONTENT_IDS: 'setBlockContentIds',
  REPLACE_RUN_SPAN: 'replaceRunSpan',
  SET_BLOCK_RUNS: 'setBlockRuns',
  EDIT_RUN_CHARS: 'editRunChars',
  ADD_FIELD_TYPE: 'addFieldType',
  UPDATE_FIELD_TYPE: 'updateFieldType',
  REMOVE_FIELD_TYPE: 'removeFieldType',
  ADD_COMMENT_THREAD: 'addCommentThread',
  REMOVE_COMMENT_THREAD: 'removeCommentThread',
  ADD_COMMENT_REPLY: 'addCommentReply',
  REMOVE_COMMENT_REPLY: 'removeCommentReply',
  RESOLVE_COMMENT: 'resolveComment',
};

export function insertBlock(block, parentId, index, subtree) {
  return { type: OP.INSERT_BLOCK, block, parentId, index, subtree };
}

export function removeBlock(id) {
  return { type: OP.REMOVE_BLOCK, id };
}

export function moveBlock(id, toParentId, toIndex) {
  return { type: OP.MOVE_BLOCK, id, toParentId, toIndex };
}

export function updateBlockProps(id, patch) {
  return { type: OP.UPDATE_BLOCK_PROPS, id, patch };
}

/**
 * Changes a block's own `type` and wholesale-replaces its `props`, keeping
 * its id (and therefore its parentId/contentIds/subscribers) exactly as
 * they are — the in-place counterpart to "delete the old block, insert a
 * new one of a different type." Keeping the id stable is what lets a CRDT
 * merge concurrent type-conversions of the same block as one field-level
 * conflict (last-write-wins) instead of two unrelated structural edits.
 * `blockType` (not `type`) to avoid colliding with the operation envelope's
 * own `type` key.
 */
export function changeBlockType(id, blockType, props) {
  return { type: OP.CHANGE_BLOCK_TYPE, id, blockType, props };
}

export function updateRun(id, patch) {
  return { type: OP.UPDATE_RUN, id, patch };
}

/**
 * Tombstones `tombstoneIds` and restores `restoreIds` within a run's own
 * character CRDT (see EditorStore's `_getRunOrder`/`_editRunText`) — the
 * precise undo/redo counterpart to a text `updateRun`, used instead of a
 * whole-value replace so undoing your own edit only ever touches the
 * character ids YOU inserted/deleted, never a peer's concurrent edit to
 * the same run. Deliberately self-inverting: applying this op's own
 * returned inverse is just this same op with the two arrays swapped, which
 * is what makes undo/redo of a text edit cycle correctly back and forth.
 *
 * `previousValue`, when given, is a cosmetic-only plain-string snapshot of
 * the run's value right before the edit this is the inverse of — used
 * exclusively by History's caret-restoration (`computeEntrySelection`) and
 * opt-in change log (`getChangeLog`), never for undo's actual data
 * correctness (that's the tombstone/restore ids above).
 */
export function editRunChars(id, tombstoneIds, restoreIds, previousValue) {
  return { type: OP.EDIT_RUN_CHARS, id, tombstoneIds, restoreIds, previousValue };
}

/** Directly reassigns a block's contentIds array (e.g. merging one block's runs into another). */
export function setBlockContentIds(blockId, contentIds) {
  return { type: OP.SET_BLOCK_CONTENT_IDS, blockId, contentIds };
}

/**
 * Replaces a contiguous span of existing run ids within a leaf block's
 * contentIds with a new set of run objects — e.g. splitting one run into
 * before/formatted-middle/after when toggling a mark on part of its text.
 * `oldRunIds` must be contiguous in the block's current contentIds.
 */
export function replaceRunSpan(blockId, oldRunIds, newRuns) {
  return { type: OP.REPLACE_RUN_SPAN, blockId, oldRunIds, newRuns };
}

/**
 * Wholesale replaces a leaf block's entire run list (and their order) —
 * the "I don't know exactly what changed structurally, just resync
 * everything" escape hatch used when reconciling arbitrary DOM mutations
 * (paste-into-contentEditable, IME composition boundaries) back into the
 * store. Prefer per-run `updateRun` when only text values changed — this
 * op is coarser-grained for undo (one step for the whole resync).
 */
export function setBlockRuns(blockId, runs) {
  return { type: OP.SET_BLOCK_RUNS, blockId, runs };
}

/**
 * Persists a user-created custom select field type (see
 * createSelectFieldType / registerStoredFieldTypes) — `fieldType` is
 * `{ id, label, placeholder, variant, options: [{value,label,color?}] }`.
 * Only ever used for STATIC, in-editor-authored types; code-registered
 * (developer-defined, possibly dynamic/DB-backed) field types never go
 * through the store at all.
 */
export function addFieldType(fieldType) {
  return { type: OP.ADD_FIELD_TYPE, fieldType };
}

export function updateFieldType(id, patch) {
  return { type: OP.UPDATE_FIELD_TYPE, id, patch };
}

export function removeFieldType(id) {
  return { type: OP.REMOVE_FIELD_TYPE, id };
}

/**
 * Adds a comment thread — `thread` is `{ id, blockId, anchorRunIds,
 * resolved, messages }` (see src/comments/comments.js's addComment, which
 * is the documented entry point; this raw op is exposed for advanced use
 * the same way editRunChars is). Unlike ADD_FIELD_TYPE/UPDATE_FIELD_TYPE/
 * REMOVE_FIELD_TYPE (which are local-only in collaboration today), comment
 * thread ops DO set a wire envelope and DO have an applyRemoteOperation
 * case — see EditorStore.
 */
export function addCommentThread(thread) {
  return { type: OP.ADD_COMMENT_THREAD, thread };
}

export function removeCommentThread(commentId) {
  return { type: OP.REMOVE_COMMENT_THREAD, commentId };
}

/** Appends `message` ({ id, authorId, text, createdAt }) to an existing thread's messages. */
export function addCommentReply(commentId, message) {
  return { type: OP.ADD_COMMENT_REPLY, commentId, message };
}

/** The precise inverse of addCommentReply — removes one reply by its own id (not the whole thread). */
export function removeCommentReply(commentId, messageId) {
  return { type: OP.REMOVE_COMMENT_REPLY, commentId, messageId };
}

export function resolveComment(commentId, resolved) {
  return { type: OP.RESOLVE_COMMENT, commentId, resolved };
}
