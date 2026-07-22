import { removeBlock, setBlockContentIds, insertBlock } from '../../store/operations.js';
import { isContentlessBlock } from './contentless.js';
import { createTextLeafBlock } from './leafBlockFactory.js';
import { ensureRootNonEmpty } from './ensureRootNonEmpty.js';

// Container types that should vanish entirely once their one-and-only
// content block is emptied out, rather than leaving an empty box behind —
// e.g. an empty callout with nothing typed into it. Deliberately does NOT
// include layoutColumn: removing one column would break an N-column
// layout's symmetry, which isn't the same situation as a callout with
// nothing left to say.
const UNWRAP_WHEN_SOLE_CHILD_EMPTIED = new Set(['callout']);

// Block types whose contentIds are always run ids (never child blocks) and
// whose only real difference is presentational (heading level, or a quote's
// left border, vs plain paragraph) — merging across these keeps the
// surviving (previous) block's own type/props untouched, so merging a
// paragraph up into a heading stays a heading, backspacing into a quote
// keeps it a quote, and vice versa. Deliberately does NOT include
// tableCell/listItem: those have distinct structural roles (a cell belongs
// to a row; a list item carries indentation/marker state) where "just
// concatenate the text and keep whichever type was already there" isn't
// the right semantics.
export const MERGEABLE_TEXT_TYPES = new Set(['paragraph', 'heading', 'blockquote']);

export function canMergeTypes(prevType, blockType) {
  return prevType === blockType || (MERGEABLE_TEXT_TYPES.has(prevType) && MERGEABLE_TEXT_TYPES.has(blockType));
}

/**
 * Backspace-at-start-of-block behavior:
 * 1. If the previous sibling is contentless (e.g. a divider), delete *it*
 *    first and stay put — matches the familiar "backspace clears the
 *    nearest obstacle" convention, and means a second
 *    backspace then merges into whatever's before the divider.
 * 2. Else if this block is empty, delete it.
 * 3. Else merge its inline content onto the end of the previous sibling —
 *    same type, or both are in MERGEABLE_TEXT_TYPES (paragraph/heading, in
 *    either direction) — and delete the now-empty shell. Any other type
 *    pairing (a table, a list item, ...) is left alone; merging into those
 *    doesn't have well-defined semantics in v1.
 *
 * 4. Special case when there's *nothing before this block at all* (it's
 *    first in its container, so there's no "merge into" target): a block
 *    with real content still does nothing (matches every other editor —
 *    Backspace at the absolute start of the first line is a no-op when
 *    there's something to preserve). But an *empty* leading block should
 *    still go away — removed outright if something follows it, or, if
 *    it's the only block left, replaced with a blank paragraph (same
 *    "never leave nothing to click into" fallback as
 *    exitListItemToParagraph / ensureRootNonEmpty). Without this, an empty
 *    heading/paragraph that happens to be first (very often *the only
 *    block left* after deleting everything else) could never be removed
 *    at all.
 *
 * All of this is one atomic undo step: if `store` is a History instance
 * (has performBatch), the ops are grouped; a plain EditorStore just applies
 * them in sequence (no undo tracking to group).
 *
 * Returns the id of the block that should receive focus afterward, or null
 * if there was nothing to do.
 */
export function mergeWithPreviousOrDelete(store, blockId) {
  const block = store.getBlock(blockId);
  if (!block) return null;

  const parent = store.getBlock(block.parentId);
  const index = parent.contentIds.indexOf(blockId);
  const isEmpty = block.contentIds.length === 0 || (block.contentIds.length === 1 && isBlankRun(store, block.contentIds[0]));

  if (index <= 0) {
    if (!isEmpty) return null; // real content, nothing before it: no-op, as every other editor does

    if (parent.contentIds.length > 1) {
      applyOps(store, [removeBlock(blockId)]);
      return store.getBlock(parent.id).contentIds[0]; // whatever's now first
    }

    // The sole (now-empty) child of a container that should disappear once
    // there's nothing left in it (e.g. a callout) — remove the CONTAINER
    // itself, not just this child, instead of leaving an empty box behind.
    if (UNWRAP_WHEN_SOLE_CHILD_EMPTIED.has(parent.type)) {
      return unwrapEmptyContainer(store, parent);
    }

    if (block.type === 'paragraph') return null; // already the fallback shape; nothing to do

    const { block: fallbackBlock, runs } = createTextLeafBlock('paragraph')(parent.id);
    applyOps(store, [
      insertBlock(fallbackBlock, parent.id, index, { blocks: [fallbackBlock], runs }),
      removeBlock(blockId),
    ]);
    return fallbackBlock.id;
  }

  const prevId = parent.contentIds[index - 1];
  const prev = store.getBlock(prevId);

  // An empty CURRENT block always goes first, even when the previous
  // sibling is a non-editable block (divider/embed) — Backspace on a
  // trailing empty paragraph should make the empty paragraph disappear
  // (ordinary empty-block behavior) before anything about the
  // non-editable neighbor is offered at all. Checking isContentlessBlock
  // first here would instead delete the neighbor immediately, one
  // Backspace too early. (In the normal keyboard path this is actually
  // decided one layer up, in EditableBlockContent, which only offers the
  // neighbor select-then-delete flow once the current block has real
  // content left — this ordering just keeps the pure function's own
  // behavior consistent for direct callers.)
  if (isEmpty) {
    applyOps(store, [removeBlock(blockId)]);
    return prevId;
  }

  if (isContentlessBlock(store, prev)) {
    applyOps(store, [removeBlock(prevId)]);
    return blockId; // stay put; the obstacle is gone, no DOM remount needed
  }

  if (!prev || !canMergeTypes(prev.type, block.type)) return null;

  const mergedContentIds = [...prev.contentIds, ...block.contentIds];
  applyOps(store, [
    setBlockContentIds(prevId, mergedContentIds),
    setBlockContentIds(blockId, []), // detach moved runs before deleting the shell
    removeBlock(blockId),
  ]);
  return prevId;
}

function isBlankRun(store, runId) {
  const run = store.getRun(runId);
  return !run || (run.value ?? '') === '';
}

/**
 * Removes `container` itself (e.g. a callout whose only child was just
 * emptied out), focusing whatever now sits where it used to — its previous
 * sibling, or else its next sibling, or else (the container was the only
 * thing under the document root) whatever ensureRootNonEmpty falls back
 * to, so there's always still somewhere to land the caret.
 */
function unwrapEmptyContainer(store, container) {
  const grandParent = store.getBlock(container.parentId);
  if (!grandParent) return null;
  const idx = grandParent.contentIds.indexOf(container.id);
  const prevId = idx > 0 ? grandParent.contentIds[idx - 1] : null;
  const nextId = idx !== -1 && idx < grandParent.contentIds.length - 1 ? grandParent.contentIds[idx + 1] : null;

  applyOps(store, [removeBlock(container.id)]);
  const fallbackId = ensureRootNonEmpty(store);
  return prevId ?? nextId ?? fallbackId;
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') {
    store.performBatch(ops);
  } else {
    for (const op of ops) store.applyOperation(op);
  }
}
