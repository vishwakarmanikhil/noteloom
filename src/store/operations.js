export const OP = {
  INSERT_BLOCK: 'insertBlock',
  REMOVE_BLOCK: 'removeBlock',
  MOVE_BLOCK: 'moveBlock',
  UPDATE_BLOCK_PROPS: 'updateBlockProps',
  UPDATE_RUN: 'updateRun',
  SET_BLOCK_CONTENT_IDS: 'setBlockContentIds',
  REPLACE_RUN_SPAN: 'replaceRunSpan',
  SET_BLOCK_RUNS: 'setBlockRuns',
  ADD_FIELD_TYPE: 'addFieldType',
  UPDATE_FIELD_TYPE: 'updateFieldType',
  REMOVE_FIELD_TYPE: 'removeFieldType',
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

export function updateRun(id, patch) {
  return { type: OP.UPDATE_RUN, id, patch };
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
