import { removeBlock, updateBlockProps, insertBlock } from '../../store/operations.js';
import { outdentListItem } from './indentCommands.js';
import { isContentlessBlock } from '../shared/contentless.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

export function isBlankTitle(store, titleRunIds) {
  return titleRunIds.length === 0 || (titleRunIds.length === 1 && (store.getRun(titleRunIds[0])?.value ?? '') === '');
}

/**
 * True when a list item's own nested content is empty — either no children
 * at all, or just its single seeded blank paragraph, still untouched. A
 * toggle item (collapsed !== undefined) is *always* seeded with one blank
 * paragraph child by createListItemBlock, so checking for literally zero
 * children (as the rest of this file used to) can never be true for a
 * toggle in practice — making an entirely empty toggle permanently
 * undeletable via Backspace. This treats "just the untouched seeded
 * paragraph" the same as "no children", matching the same fix already
 * applied to toggle heading (see toggleHeading/mergeCommands.js's
 * isBodyEmpty).
 */
function isBodyEmpty(store, block) {
  const childIds = block.contentIds ?? [];
  if (childIds.length === 0) return true;
  if (childIds.length > 1) return false;
  const onlyChild = store.getBlock(childIds[0]);
  return Boolean(onlyChild) && onlyChild.type === 'paragraph' && isRunsEmpty(store, onlyChild.contentIds);
}

/**
 * Backspace-at-start-of-title behavior for a list item, distinct from
 * mergeWithPreviousOrDelete (paragraph/heading) because a list item's own
 * text lives in props.titleRunIds, not contentIds (contentIds holds nested
 * child items instead).
 *
 * - Previous sibling at this level is contentless (e.g. a divider): delete
 *   *it* first and stay put, same convention as mergeWithPreviousOrDelete.
 * - Previous sibling at this level + this item is empty: just delete it.
 * - Previous sibling at this level + this item has text, no nested
 *   children of its own: merge its title onto the previous sibling's title
 *   (only when the previous sibling is also a listItem) and delete the
 *   shell. If it has nested children, merging is skipped (v1 scope — see
 *   navigationCommands' similar container-boundary caveat).
 * - No previous sibling, but nested under another list item: outdent
 *   instead (matches common list-editor Backspace behavior).
 * - No previous sibling and already top-level: no-op (nothing sensible to
 *   merge into without cross-container merging, which is out of scope).
 *
 * Returns `{ focusBlockId, needsRefocus }` or null if nothing happened.
 * `needsRefocus` distinguishes two cases that both return the item's own
 * id: after an outdent the item is reparented (a different contentIds
 * array owns it, so React remounts it and focus is lost — needsRefocus:
 * true); after deleting a preceding divider the item never moved (same
 * parent, same position, no remount — needsRefocus: false, the browser
 * keeps the caret where it already was).
 */
export function mergeListItemOrOutdent(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const titleRunIds = block.props.titleRunIds ?? [];
  const titleEmpty = isBlankTitle(store, titleRunIds);
  // Entirely empty means BOTH the title and the nested body are empty (see
  // isBodyEmpty) — an empty title with real nested content underneath
  // (very common for a toggle, whose whole point is holding content under
  // a collapsed/expanded line) must not vanish along with its subtree just
  // because its own title happens to be blank right now.
  const empty = titleEmpty && isBodyEmpty(store, block);

  if (index > 0) {
    const prevId = parent.contentIds[index - 1];
    const prev = store.getBlock(prevId);

    // An empty CURRENT item goes first, even next to a non-editable
    // previous sibling (divider) — see the matching comment in
    // shared/mergeCommands.js for why this ordering matters.
    if (empty) {
      applyOps(store, [removeBlock(blockId)]);
      return { focusBlockId: prevId, needsRefocus: true };
    }

    if (isContentlessBlock(store, prev)) {
      applyOps(store, [removeBlock(prevId)]);
      return { focusBlockId: blockId, needsRefocus: false };
    }

    if (prev?.type === 'listItem' && block.contentIds.length === 0) {
      const mergedTitleRunIds = [...(prev.props.titleRunIds ?? []), ...titleRunIds];
      applyOps(store, [
        updateBlockProps(prevId, { titleRunIds: mergedTitleRunIds }),
        updateBlockProps(blockId, { titleRunIds: [] }), // detach before delete
        removeBlock(blockId),
      ]);
      return { focusBlockId: prevId, needsRefocus: true };
    }

    return null; // has nested children or previous sibling isn't a listItem: v1 skips this merge
  }

  if (parent.type === 'listItem') {
    outdentListItem(store, blockId);
    return { focusBlockId: blockId, needsRefocus: true }; // reparented: remounted, needs explicit refocus
  }

  // Top-level first item with nothing before it: real content stays put,
  // matching every other editor's "Backspace at the absolute start is a
  // no-op when there's something to preserve". But an entirely empty item
  // should still be removable — same "never a permanent dead end" fallback
  // as mergeToggleHeadingOrNoop/mergeWithPreviousOrDelete: without this, a
  // toggle (always seeded with one blank child) could never satisfy the old
  // "contentIds.length === 0" check, making it permanently undeletable
  // whenever it happens to be first/only in its container.
  if (!empty) return null;

  if (parent.contentIds.length > 1) {
    applyOps(store, [removeBlock(blockId)]);
    return { focusBlockId: store.getBlock(parent.id).contentIds[0], needsRefocus: true };
  }

  const { block: fallbackBlock, runs } = createTextLeafBlock('paragraph')(parent.id);
  applyOps(store, [
    insertBlock(fallbackBlock, parent.id, index, { blocks: [fallbackBlock], runs }),
    removeBlock(blockId),
  ]);
  return { focusBlockId: fallbackBlock.id, needsRefocus: true };
}
