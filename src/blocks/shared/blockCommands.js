import { insertBlock, updateRun, setBlockRuns, removeBlock } from '../../store/operations.js';
import { focusBlockStart } from './navigationCommands.js';
import { resolveCollapsedCaret } from '../../react/selectionResolve.js';
import { genId } from '../../utils/idGen.js';

/**
 * Inserts a new block immediately after `currentBlockId`, as a sibling under
 * the same parent. `factory(parentId)` must return `{ block, runs, subtreeBlocks }`
 * — `runs` may be empty for non-leaf types, and `subtreeBlocks` (default [])
 * holds any additional descendant blocks for multi-level inserts (e.g. a
 * table's rows/cells alongside its own root block). Shared by every block
 * type's slash command so "where do I insert relative to the current block"
 * is written once.
 */
export function insertSiblingAfter(store, currentBlockId, factory) {
  const current = store.getBlock(currentBlockId);
  const parentId = current.parentId;
  const parent = store.getBlock(parentId);
  const index = parent.contentIds.indexOf(currentBlockId) + 1;
  const { block, runs = [], subtreeBlocks = [] } = factory(parentId);
  store.applyOperation(insertBlock(block, parentId, index, { blocks: [block, ...subtreeBlocks], runs }));
  return block.id;
}

/**
 * Same as insertSiblingAfter, but also moves focus into the new block —
 * every editor does this (Enter, or picking a block from the slash menu,
 * always lands the caret in the thing you just created, never leaves it on
 * the block you triggered it from). Descends into containers (table,
 * layout) to find the first actually-typeable position.
 */
export function insertSiblingAfterAndFocus(store, currentBlockId, factory) {
  const newBlockId = insertSiblingAfter(store, currentBlockId, factory);
  focusBlockStart(store, newBlockId);
  return newBlockId;
}

/**
 * Inserts a new block as the *first child* of `parentBlockId` and focuses
 * it. Used when a container block (a list item with nested items beneath
 * it) needs the new block to appear visually right after the parent's own
 * content but before its existing children — since children render
 * *inside* the parent's own DOM subtree, a "sibling in the grandparent's
 * array" would only ever land after that whole subtree, not between the
 * parent's title and its first child.
 */
export function insertFirstChildAndFocus(store, parentBlockId, factory) {
  const { block, runs = [], subtreeBlocks = [] } = factory(parentBlockId);
  store.applyOperation(insertBlock(block, parentBlockId, 0, { blocks: [block, ...subtreeBlocks], runs }));
  focusBlockStart(store, block.id);
  return block.id;
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') {
    store.performBatch(ops);
  } else {
    for (const op of ops) store.applyOperation(op);
  }
}

/**
 * Pure: splits an ordered list of Run objects at `caretRunId`/`caretOffset`
 * into "everything before the caret" and "everything at/after it",
 * splitting the caret's own run in two when it's a text run with content on
 * both sides. Identity is preserved wherever possible (a run that doesn't
 * actually get cut keeps its id) so only a genuine mid-run split spends a
 * new id. Neither side is ever left with zero runs — a block needs at least
 * one run to render/anchor a caret in, so an empty side gets a fresh blank
 * text run.
 */
export function splitRunsAtCaret(runs, caretRunId, caretOffset) {
  const idx = runs.findIndex((r) => r.id === caretRunId);
  if (idx === -1) return null;

  const caretRun = runs[idx];
  const before = runs.slice(0, idx);
  const after = runs.slice(idx + 1);

  if (caretRun.type === 'text') {
    const value = caretRun.value ?? '';
    const leftValue = value.slice(0, caretOffset);
    const rightValue = value.slice(caretOffset);
    if (leftValue && rightValue) {
      before.push({ ...caretRun, value: leftValue });
      after.unshift({ ...caretRun, id: genId(), value: rightValue });
    } else if (rightValue) {
      after.unshift(caretRun); // caret at the run's start: whole run moves right, unchanged
    } else {
      before.push(caretRun); // caret at the run's end (or run already empty): stays left, unchanged
    }
  } else if (caretOffset > 0) {
    before.push(caretRun); // atomic run: never split inside it, only before/after
  } else {
    after.unshift(caretRun);
  }

  const leftRuns = before.length ? before : [{ id: genId(), type: 'text', value: '', marks: {} }];
  const rightRuns = after.length ? after : [{ id: genId(), type: 'text', value: '', marks: {} }];
  return { leftRuns, rightRuns };
}

/**
 * Enter-to-split: every real editor splits the block's content at the
 * caret (text before stays, text after moves into the new sibling) rather
 * than always creating a blank sibling and leaving all the text behind.
 * Falls back to the old "just append an empty sibling" behavior when there
 * is no resolvable live caret in this exact block (no DOM selection at all,
 * as in most non-interactive tests, or a caret that landed somewhere else).
 *
 * `currentRunIds` must be the block's own run ids (contentIds for a plain
 * leaf, props.titleRunIds for a listItem) — same convention as
 * EditableBlockContent's `runIds` prop. `factory(parentId, initialRuns?)`
 * must accept the optional pre-built run list (see createTextLeafBlock/
 * createListItemBlock).
 */
export function insertSiblingSplitAtCaretAndFocus(store, blockId, currentRunIds, factory) {
  const current = store.getBlock(blockId);
  const parent = store.getBlock(current.parentId);
  const index = parent.contentIds.indexOf(blockId) + 1;
  return splitAndInsertAtCaret(store, blockId, currentRunIds, factory, {
    insertParentId: parent.id,
    insertIndex: index,
    fallback: () => insertSiblingAfterAndFocus(store, blockId, factory),
  });
}

/**
 * Same idea as insertSiblingSplitAtCaretAndFocus, but for the "this item has
 * nested children" case (see insertFirstChildAndFocus): the new block's
 * content is the split-off right-hand runs, and it lands as the first child
 * of `blockId` itself (whose own title runs get truncated to the left half)
 * rather than as its sibling.
 */
export function insertFirstChildSplitAtCaretAndFocus(store, blockId, currentRunIds, factory) {
  return splitAndInsertAtCaret(store, blockId, currentRunIds, factory, {
    insertParentId: blockId,
    insertIndex: 0,
    fallback: () => insertFirstChildAndFocus(store, blockId, factory),
  });
}

function splitAndInsertAtCaret(store, blockId, currentRunIds, factory, { insertParentId, insertIndex, fallback }) {
  const caret = resolveCollapsedCaret();
  if (!caret || caret.blockId !== blockId) return fallback();

  const currentRuns = currentRunIds.map((id) => store.getRun(id)).filter(Boolean);
  const split = splitRunsAtCaret(currentRuns, caret.runId, caret.offset);
  if (!split) return fallback();

  const { leftRuns, rightRuns } = split;
  const { block, runs = rightRuns, subtreeBlocks = [] } = factory(insertParentId, rightRuns);

  // Enter at the very start of a block's content leaves nothing before the
  // caret, so leftRuns comes back empty — but the block staying behind
  // must never end up with zero runs: an empty contentEditable region isn't
  // a valid caret anchor in most browsers, so the next time someone types
  // into it, every keystroke mints a brand-new run instead of updating one
  // in place (the same "characters double" bug this exact guard fixes for
  // removeRun/handleInput in EditableBlockContent).
  const survivingLeftRuns = leftRuns.length ? leftRuns : [{ id: genId(), type: 'text', value: '', marks: {} }];

  applyOps(store, [
    setBlockRuns(blockId, survivingLeftRuns),
    insertBlock(block, insertParentId, insertIndex, { blocks: [block, ...subtreeBlocks], runs }),
  ]);
  focusBlockStart(store, block.id);
  return block.id;
}

function getOwnRunIds(block) {
  return block?.props?.titleRunIds ?? block?.contentIds ?? [];
}

// A listItem's own text lives in props.titleRunIds while contentIds holds
// its nested child *blocks* — so for it (and any other block shaped that
// way), contentIds having entries means it has children, not extra runs.
function hasNestedChildren(block) {
  return Boolean(block?.props?.titleRunIds) && (block.contentIds?.length ?? 0) > 0;
}

/**
 * Converts an empty block in place to a different type, instead of leaving
 * the old empty block behind with a new sibling after it — e.g. picking
 * "Heading" from the slash menu on a still-empty paragraph turns that same
 * paragraph into the heading, rather than inserting a heading after an
 * orphaned blank paragraph. Removes the old block and inserts the new one
 * at the same index as one atomic step, so undo/redo treats it as a single
 * operation.
 */
function replaceBlockInPlace(store, blockId, factory) {
  const current = store.getBlock(blockId);
  const parentId = current.parentId;
  const parent = store.getBlock(parentId);
  const index = parent.contentIds.indexOf(blockId);
  const { block, runs = [], subtreeBlocks = [] } = factory(parentId);

  applyOps(store, [
    removeBlock(blockId),
    insertBlock(block, parentId, index, { blocks: [block, ...subtreeBlocks], runs }),
  ]);
  focusBlockStart(store, block.id);
  return block.id;
}

/**
 * Slash-command entry point for block-level commands: removes the
 * "/query" span from the triggering run (merging whatever was before and
 * after it — a block command doesn't need to preserve a split point the
 * way an inline command does, since it's creating an entirely separate
 * sibling block, not splicing into this one).
 *
 * If trimming the query leaves the block completely empty — it was the
 * block's only run and the block has no nested children — the block is
 * converted in place (replaceBlockInPlace) rather than inserted after,
 * which would otherwise leave a pointless empty block sitting above the
 * one the user actually meant to create. Otherwise, behaves as before:
 * trims the query and inserts+focuses the new block after the current one.
 */
export function trimSlashQueryAndInsertAfter(store, { blockId, runId, sliceStart, sliceEnd }, factory) {
  const run = store.getRun(runId);
  const value = run?.value ?? '';
  const newValue = value.slice(0, sliceStart) + value.slice(sliceEnd);

  const block = store.getBlock(blockId);
  const ownRunIds = getOwnRunIds(block);
  const isOnlyRun = ownRunIds.length === 1 && ownRunIds[0] === runId;
  const wouldBeEmpty = isOnlyRun && newValue === '' && !hasNestedChildren(block);

  if (wouldBeEmpty) {
    return replaceBlockInPlace(store, blockId, factory);
  }

  store.applyOperation(updateRun(runId, { value: newValue }));
  return insertSiblingAfterAndFocus(store, blockId, factory);
}
