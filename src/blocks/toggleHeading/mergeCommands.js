import { removeBlock, insertBlock } from '../../store/operations.js';
import { isContentlessBlock } from '../shared/contentless.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

export function isBlankTitle(store, titleRunIds) {
  return titleRunIds.length === 0 || (titleRunIds.length === 1 && (store.getRun(titleRunIds[0])?.value ?? '') === '');
}

/**
 * True when this toggle heading's body has no real content at all — either
 * no children (shouldn't normally happen; createToggleHeadingBlock always
 * seeds one) or just its single seeded blank paragraph, still untouched.
 * Anything more (a second child, or the sole child holding real text/other
 * content) counts as "has content".
 */
function isBodyEmpty(store, block) {
  const childIds = block.contentIds ?? [];
  if (childIds.length === 0) return true;
  if (childIds.length > 1) return false;
  const onlyChild = store.getBlock(childIds[0]);
  return Boolean(onlyChild) && onlyChild.type === 'paragraph' && isRunsEmpty(store, onlyChild.contentIds);
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Backspace-at-start for a toggle heading's own title. A toggle heading is
 * only ever removable when it's *entirely* blank — title empty AND its
 * body is empty too (see isBodyEmpty) — since createToggleHeadingBlock
 * always seeds one blank paragraph child, checking for literally zero
 * children (the previous version of this check) could never be true in
 * practice, making an empty toggle heading permanently undeletable via
 * Backspace. isBodyEmpty treats "just the untouched seeded paragraph" the
 * same as "no children" to fix that.
 *
 * No merge-into-previous-sibling behavior at all (unlike plain paragraph/
 * heading, which concatenate text into whatever's before them): a toggle
 * heading isn't in MERGEABLE_TEXT_TYPES, since "concatenate this section's
 * title into a plain paragraph" has no well-defined meaning once it may be
 * carrying nested children — matches the same non-mergeable precedent as
 * table/listItem/callout.
 */
export function mergeToggleHeadingOrNoop(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;
  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const titleRunIds = block.props.titleRunIds ?? [];
  const empty = isBlankTitle(store, titleRunIds) && isBodyEmpty(store, block);

  if (index <= 0) {
    if (!empty) return null; // real content somewhere, nothing before it: no-op, as every other editor does

    if (parent.contentIds.length > 1) {
      applyOps(store, [removeBlock(blockId)]);
      return { focusBlockId: store.getBlock(parent.id).contentIds[0], needsRefocus: true };
    }

    // sole block in its container: replace with a blank paragraph so
    // there's still somewhere to type, same "never leave nothing to click
    // into" fallback as mergeWithPreviousOrDelete/ensureRootNonEmpty.
    const { block: fallbackBlock, runs } = createTextLeafBlock('paragraph')(parent.id);
    applyOps(store, [
      insertBlock(fallbackBlock, parent.id, index, { blocks: [fallbackBlock], runs }),
      removeBlock(blockId),
    ]);
    return { focusBlockId: fallbackBlock.id, needsRefocus: true };
  }

  const prevId = parent.contentIds[index - 1];
  const prev = store.getBlock(prevId);

  // An entirely-empty CURRENT toggle heading goes first, even next to a
  // non-editable previous sibling — see the matching comment in
  // shared/mergeCommands.js for why this ordering matters.
  if (empty) {
    applyOps(store, [removeBlock(blockId)]);
    return { focusBlockId: prevId, needsRefocus: true };
  }

  if (isContentlessBlock(store, prev)) {
    applyOps(store, [removeBlock(prevId)]);
    return { focusBlockId: blockId, needsRefocus: false };
  }

  return null;
}
