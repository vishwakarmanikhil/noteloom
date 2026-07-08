import { moveBlock } from '../../store/operations.js';
import { focusAdjacentBlock, focusBlockStart } from '../shared/navigationCommands.js';

/**
 * Tab: makes this list item a child (nested one level deeper) of its
 * previous sibling — but only when that previous sibling is itself a
 * listItem. Nesting under a non-container block (a paragraph, heading,
 * etc.) would silently make this item invisible: only container block
 * types render `<BlockChildren>` for their contentIds, so a listItem
 * reparented under, say, a paragraph would still exist in the store but
 * never be rendered anywhere — this is what "the whole list disappeared"
 * turned out to be. When there's no previous sibling to nest under (this
 * is the first item, or no valid listItem precedes it), Tab moves focus to
 * the next block instead of doing nothing silently.
 *
 * moveBlock reparents the item — a different contentIds array now owns it,
 * so React remounts its subtree under the new parent and any DOM focus it
 * had is destroyed. Must explicitly refocus afterward, same as every other
 * reparenting path (outdent-on-Backspace, outdent-on-Enter) already does.
 */
export function indentListItem(store, blockId) {
  const block = store.getBlock(blockId);
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const prevId = index > 0 ? parent.contentIds[index - 1] : null;
  const prev = prevId ? store.getBlock(prevId) : null;

  if (!prev || prev.type !== 'listItem') {
    focusAdjacentBlock(store, blockId, 'down');
    return;
  }

  store.applyOperation(moveBlock(blockId, prevId, prev.contentIds.length));
  focusBlockStart(store, blockId);
}

/**
 * Shift+Tab: promotes this list item to be a sibling of its current parent
 * list item, placed right after it. No-op if the parent isn't itself a
 * list item (i.e. this item is already at the top level). Also reparents
 * (see indentListItem's note above) — refocuses afterward for the same
 * reason.
 */
export function outdentListItem(store, blockId) {
  const block = store.getBlock(blockId);
  const currentParent = store.getBlock(block.parentId);
  if (!currentParent || currentParent.type !== 'listItem') return;
  const grandParentId = currentParent.parentId;
  const grandParent = store.getBlock(grandParentId);
  const parentIndex = grandParent.contentIds.indexOf(currentParent.id);
  store.applyOperation(moveBlock(blockId, grandParentId, parentIndex + 1));
  focusBlockStart(store, blockId);
}
