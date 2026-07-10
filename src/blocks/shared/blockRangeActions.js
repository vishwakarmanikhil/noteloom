import { removeBlock, moveBlock, updateBlockProps } from '../../store/operations.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Removes every block in `blockIds` (a contiguous run — see
 * useBlockRangeDrag) as ONE atomic undo step, regardless of how many
 * blocks are in the range. Each `removeBlock` op looks its own target's
 * index up fresh at apply time (see EditorStore), so issuing one op per id
 * in document order is correct without any special ordering care.
 */
export function deleteBlockRange(store, blockIds) {
  if (blockIds.length === 0) return;
  applyOps(store, blockIds.map((id) => removeBlock(id)));
}

/**
 * Moves the whole contiguous range up by one sibling position — implemented
 * as swapping the range with its immediately preceding sibling (ONE
 * `moveBlock` op moving that single neighbor to just after the range's new
 * end) rather than moving every block in the range individually. Returns
 * false (no-op) if the range is already at the top.
 */
export function moveBlockRangeUp(store, blockIds) {
  if (blockIds.length === 0) return false;
  const first = store.getBlock(blockIds[0]);
  if (!first) return false;
  const parent = store.getBlock(first.parentId);
  if (!parent) return false;

  const startIndex = parent.contentIds.indexOf(blockIds[0]);
  const endIndex = parent.contentIds.indexOf(blockIds[blockIds.length - 1]);
  if (startIndex <= 0) return false;

  const precedingId = parent.contentIds[startIndex - 1];
  store.applyOperation(moveBlock(precedingId, first.parentId, endIndex));
  return true;
}

/** Symmetric to moveBlockRangeUp — swaps the range with its immediately following sibling. */
export function moveBlockRangeDown(store, blockIds) {
  if (blockIds.length === 0) return false;
  const first = store.getBlock(blockIds[0]);
  if (!first) return false;
  const parent = store.getBlock(first.parentId);
  if (!parent) return false;

  const startIndex = parent.contentIds.indexOf(blockIds[0]);
  const endIndex = parent.contentIds.indexOf(blockIds[blockIds.length - 1]);
  if (endIndex === -1 || endIndex >= parent.contentIds.length - 1) return false;

  const followingId = parent.contentIds[endIndex + 1];
  store.applyOperation(moveBlock(followingId, first.parentId, startIndex));
  return true;
}

/** True only if every block in the range is currently hidden — used to decide whether the menu's toggle should read "Hide" or "Show". */
export function isEntireBlockRangeHidden(store, blockIds) {
  return blockIds.length > 0 && blockIds.every((id) => Boolean(store.getBlock(id)?.props?.hidden));
}

/** Sets props.hidden on every block in the range, one atomic undo step. */
export function setBlockRangeHidden(store, blockIds, hidden) {
  if (blockIds.length === 0) return;
  applyOps(store, blockIds.map((id) => updateBlockProps(id, { hidden })));
}

/**
 * Re-derives a previously-captured id set's DOCUMENT order from the
 * store's current contentIds — used after a move/hide action to keep
 * `selectedBlockRange` valid (same ids, correct order) without the caller
 * needing to know the tree shape itself.
 */
export function reorderBlockRangeFromStore(store, blockIds) {
  if (blockIds.length === 0) return [];
  const first = store.getBlock(blockIds[0]);
  const parent = first && store.getBlock(first.parentId);
  if (!parent) return blockIds;
  const idSet = new Set(blockIds);
  return parent.contentIds.filter((id) => idSet.has(id));
}
