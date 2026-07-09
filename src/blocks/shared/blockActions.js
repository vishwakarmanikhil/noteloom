import { insertBlock, removeBlock, moveBlock } from '../../store/operations.js';
import { captureSubtree, remapSubtreeIds } from '../../clipboard/serialize.js';
import { focusBlockStart } from './navigationCommands.js';
import { ensureRootNonEmpty } from './ensureRootNonEmpty.js';

/**
 * Clones `blockId`'s entire subtree (itself + every descendant + their
 * runs, all with fresh ids — see remapSubtreeIds) and inserts the copy
 * right after the original, then focuses the copy's own first typeable
 * position. Reuses the exact same subtree-capture/id-remap machinery the
 * same-editor clipboard JSON path already relies on (see serialize.js) —
 * "duplicate" is exactly "copy, then paste right after itself."
 */
export function duplicateBlock(store, blockId) {
  const original = store.getBlock(blockId);
  if (!original) return null;
  const parent = store.getBlock(original.parentId);
  const index = parent.contentIds.indexOf(blockId);

  const subtree = captureSubtree(store, blockId);
  const { block, runs, subtreeBlocks } = remapSubtreeIds(subtree);

  store.applyOperation(insertBlock(block, parent.id, index + 1, { blocks: [block, ...subtreeBlocks], runs }));
  focusBlockStart(store, block.id);
  return block.id;
}

/**
 * Swaps `blockId` with its previous sibling under the same parent — a
 * no-op (returns false) if it's already first. `moveBlock`'s own `toIndex`
 * is interpreted against the array *after* the block has already been
 * removed from it (see EditorStore's MOVE_BLOCK case) — `index - 1` lands
 * it exactly one slot earlier in that already-shifted array, which is
 * what makes this a plain adjacent swap rather than needing any special
 * "moving backward" arithmetic.
 */
export function moveBlockUp(store, blockId) {
  const block = store.getBlock(blockId);
  const parent = block && store.getBlock(block.parentId);
  if (!parent) return false;
  const index = parent.contentIds.indexOf(blockId);
  if (index <= 0) return false;
  store.applyOperation(moveBlock(blockId, parent.id, index - 1));
  return true;
}

/** Symmetric to moveBlockUp: swaps with the next sibling, a no-op if already last. */
export function moveBlockDown(store, blockId) {
  const block = store.getBlock(blockId);
  const parent = block && store.getBlock(block.parentId);
  if (!parent) return false;
  const index = parent.contentIds.indexOf(blockId);
  if (index === -1 || index >= parent.contentIds.length - 1) return false;
  store.applyOperation(moveBlock(blockId, parent.id, index + 1));
  return true;
}

/**
 * Removes `blockId` (its whole subtree) and moves focus to whatever's now
 * in its old spot — the previous sibling, or else the next one, or else
 * (it was the only top-level block) whatever ensureRootNonEmpty falls back
 * to, so there's always still somewhere to land the caret. Same
 * prev-or-next-or-fallback convention as unwrapEmptyContainer/
 * removeTableAndFocusSibling elsewhere in this codebase.
 */
export function deleteBlockAndFocusSibling(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const prevId = index > 0 ? parent.contentIds[index - 1] : null;
  const nextId = index !== -1 && index < parent.contentIds.length - 1 ? parent.contentIds[index + 1] : null;

  store.applyOperation(removeBlock(blockId));
  const fallbackId = ensureRootNonEmpty(store);
  const targetId = prevId ?? nextId ?? fallbackId;
  if (targetId) focusBlockStart(store, targetId);
  return targetId ?? null;
}
