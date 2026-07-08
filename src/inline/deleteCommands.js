import { genId } from '../utils/idGen.js';
import { setBlockRuns, removeBlock, insertBlock } from '../store/operations.js';
import { canMergeTypes } from '../blocks/shared/mergeCommands.js';
import { createTextLeafBlock } from '../blocks/shared/leafBlockFactory.js';

function getBlockRunIds(store, blockId) {
  const block = store.getBlock(blockId);
  return block.props?.titleRunIds ?? block.contentIds;
}

function blankRun() {
  return { id: genId(), type: 'text', value: '', marks: {} };
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Deletes the [startRunId+startOffset, endRunId+endOffset) range from one
 * block's own run list. Unlike mark-toggling (applyMarkOverRunSpan), an
 * atomic (non-text) run anywhere in the range is simply dropped — there's
 * no sensible "delete the surrounding text but keep the chip" here. Falls
 * back to one blank run if the deletion would leave zero runs (same "never
 * leave a caret-less contentEditable region" guarantee as
 * EditableBlockContent's removeRun/handleInput).
 *
 * Returns `{ blockId, runId, offset }` for the collapsed caret the
 * deletion leaves behind, or null if the range didn't resolve.
 */
export function deleteRunRangeInBlock(store, blockId, selection) {
  const { startRunId, startOffset, endRunId, endOffset } = selection;
  const runIds = getBlockRunIds(store, blockId);
  const startIndex = runIds.indexOf(startRunId);
  const endIndex = runIds.indexOf(endRunId);
  if (startIndex === -1 || endIndex === -1) return null;

  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const fromOffset = startIndex <= endIndex ? startOffset : endOffset;
  const toOffset = startIndex <= endIndex ? endOffset : startOffset;

  const beforeRuns = runIds.slice(0, fromIndex).map((id) => store.getRun(id));
  const afterRuns = runIds.slice(toIndex + 1).map((id) => store.getRun(id));
  const spanRuns = runIds.slice(fromIndex, toIndex + 1).map((id) => store.getRun(id));

  const survivors = [];
  let caretRunId = null;
  let caretOffset = 0;

  if (fromIndex === toIndex) {
    const run = spanRuns[0];
    if (run.type === 'text') {
      const from = Math.max(0, Math.min(fromOffset, toOffset));
      const to = Math.min(run.value.length, Math.max(fromOffset, toOffset));
      const survivor = { ...run, value: run.value.slice(0, from) + run.value.slice(to) };
      survivors.push(survivor);
      caretRunId = survivor.id;
      caretOffset = from;
    } // atomic: dropped entirely, caret resolved from before/after below
  } else {
    spanRuns.forEach((run, i) => {
      if (run.type !== 'text') return; // atomic anywhere in a multi-run range: dropped entirely
      const isFirst = i === 0;
      const isLast = i === spanRuns.length - 1;
      // isFirst/isLast are never both true here — that's the single-run
      // case handled above (fromIndex === toIndex).
      const prefix = isFirst ? run.value.slice(0, fromOffset) : '';
      if (isFirst && prefix) {
        const prefixRun = { ...run, value: prefix };
        survivors.push(prefixRun);
        caretRunId = prefixRun.id;
        caretOffset = prefix.length;
      }
      if (isLast && !isFirst) {
        const suffixValue = run.value.slice(toOffset);
        if (suffixValue) {
          const suffixRun = { id: genId(), type: 'text', value: suffixValue, marks: run.marks };
          survivors.push(suffixRun);
          if (caretRunId === null) {
            caretRunId = suffixRun.id;
            caretOffset = 0;
          }
        }
      }
    });
  }

  let finalRuns = [...beforeRuns, ...survivors, ...afterRuns];

  if (finalRuns.length === 0) {
    const blank = blankRun();
    finalRuns = [blank];
    caretRunId = blank.id;
    caretOffset = 0;
  } else if (caretRunId === null) {
    // Nothing survived from the deleted span itself (e.g. it was a single
    // atomic run): land at the boundary — end of whatever's right before,
    // or start of whatever's right after.
    const lastBefore = beforeRuns[beforeRuns.length - 1];
    if (lastBefore) {
      caretRunId = lastBefore.id;
      caretOffset = lastBefore.type === 'text' ? lastBefore.value.length : 0;
    } else if (afterRuns[0]) {
      caretRunId = afterRuns[0].id;
      caretOffset = 0;
    }
  }

  store.applyOperation(setBlockRuns(blockId, finalRuns));
  return { blockId, runId: caretRunId, offset: caretOffset };
}

/**
 * Deletes a selection spanning *multiple sibling blocks* under a shared
 * parent (see resolveCrossBlockSelection) — the same range shape
 * toggleMarkOverBlockRange consumes, reused here for deletion instead of
 * mark-toggling. This is also what a "select all" (twice-pressed Ctrl+A,
 * which spans every top-level block under root) funnels through: the
 * general logic below naturally handles "delete the entire document" as
 * the extreme case of "delete across several sibling blocks" — no special
 * casing needed beyond the final "did this leave one lone empty
 * non-paragraph block?" check.
 *
 * Fully-covered blocks strictly between the two boundaries are removed
 * outright. The two boundary blocks are trimmed to their surviving prefix/
 * suffix; if they're mergeable text types (see canMergeTypes), those
 * survivors are combined into ONE remaining block (matching
 * mergeWithPreviousOrDelete's merge convention). If they're not mergeable
 * (e.g. the range runs from a paragraph into a table cell), both trimmed
 * blocks are simply left in place rather than guessing at cross-type
 * semantics.
 *
 * One atomic undo step. Returns `{ blockId, runId, offset }` for the
 * resulting caret position, or null if the range didn't resolve.
 */
export function deleteOverBlockRange(store, crossSelection) {
  const { blockIds, startBlockId, startRunId, startOffset, endBlockId, endRunId, endOffset } = crossSelection;
  if (!blockIds || blockIds.length === 0) return null;

  const startBlockIndex = blockIds.indexOf(startBlockId);
  const endBlockIndex = blockIds.indexOf(endBlockId);
  if (startBlockIndex === -1 || endBlockIndex === -1) return null;

  const [fromBlockIndex, toBlockIndex] =
    startBlockIndex <= endBlockIndex ? [startBlockIndex, endBlockIndex] : [endBlockIndex, startBlockIndex];
  const firstIsStart = startBlockIndex <= endBlockIndex;
  const firstRunId = firstIsStart ? startRunId : endRunId;
  const firstOffset = firstIsStart ? startOffset : endOffset;
  const lastRunId = firstIsStart ? endRunId : startRunId;
  const lastOffset = firstIsStart ? endOffset : startOffset;

  if (fromBlockIndex === toBlockIndex) {
    return deleteRunRangeInBlock(store, blockIds[fromBlockIndex], {
      startRunId: firstRunId,
      startOffset: firstOffset,
      endRunId: lastRunId,
      endOffset: lastOffset,
    });
  }

  const firstBlockId = blockIds[fromBlockIndex];
  const lastBlockId = blockIds[toBlockIndex];
  const firstBlock = store.getBlock(firstBlockId);
  const lastBlock = store.getBlock(lastBlockId);

  const firstRunIds = getBlockRunIds(store, firstBlockId);
  const firstIdx = firstRunIds.indexOf(firstRunId);
  const firstPrefixRuns = firstRunIds.slice(0, firstIdx).map((id) => store.getRun(id));
  const firstRun = store.getRun(firstRunId);
  const firstPrefixSurvivor =
    firstRun.type === 'text' && firstOffset > 0 ? { ...firstRun, value: firstRun.value.slice(0, firstOffset) } : null;

  const lastRunIds = getBlockRunIds(store, lastBlockId);
  const lastIdx = lastRunIds.indexOf(lastRunId);
  const lastSuffixRuns = lastRunIds.slice(lastIdx + 1).map((id) => store.getRun(id));
  const lastRun = store.getRun(lastRunId);
  const lastSuffixSurvivor =
    lastRun.type === 'text' && lastOffset < lastRun.value.length
      ? { id: genId(), type: 'text', value: lastRun.value.slice(lastOffset), marks: lastRun.marks }
      : null;

  const firstSurvivors = [...firstPrefixRuns, ...(firstPrefixSurvivor ? [firstPrefixSurvivor] : [])];
  const lastSurvivors = [...(lastSuffixSurvivor ? [lastSuffixSurvivor] : []), ...lastSuffixRuns];

  const ops = [];
  for (let i = fromBlockIndex + 1; i < toBlockIndex; i += 1) ops.push(removeBlock(blockIds[i]));

  const mergeable = canMergeTypes(firstBlock.type, lastBlock.type);
  const parent = store.getBlock(firstBlock.parentId);
  // Only the mergeable branch can ever collapse to a single surviving
  // block (the non-mergeable branch always leaves both first and last in
  // place) — "select all, then delete" is exactly this shape: the merge
  // leaves nothing behind, and it was the only two blocks under the
  // parent. Every real editor leaves a plain paragraph there, not
  // whatever type happened to survive (a now-empty heading, say). Decided
  // analytically (without mutating the store first) so the swap can be
  // folded into the same ops array — one atomic undo step, not two.
  const removedCount = toBlockIndex - fromBlockIndex - 1 + (mergeable ? 1 : 0);
  const wouldBeOnlyChild = parent && parent.contentIds.length - removedCount === 1;

  let caretRunId;
  let caretOffset;
  let survivingBlockId;

  if (mergeable) {
    const merged = [...firstSurvivors, ...lastSurvivors];

    if (merged.length === 0 && wouldBeOnlyChild && firstBlock.type !== 'paragraph') {
      const { block: fallbackBlock, runs } = createTextLeafBlock('paragraph')(parent.id);
      ops.push({ type: 'insertBlock', block: fallbackBlock, parentId: parent.id, index: 0, subtree: { blocks: [fallbackBlock], runs } });
      ops.push(removeBlock(firstBlockId));
      ops.push(removeBlock(lastBlockId));
      applyOps(store, ops);
      return { blockId: fallbackBlock.id, runId: fallbackBlock.contentIds[0], offset: 0 };
    }

    const finalRuns = merged.length ? merged : [blankRun()];
    ops.push(setBlockRuns(firstBlockId, finalRuns));
    ops.push(removeBlock(lastBlockId));
    survivingBlockId = firstBlockId;

    if (firstPrefixSurvivor) {
      caretRunId = firstPrefixSurvivor.id;
      caretOffset = firstPrefixSurvivor.value.length;
    } else if (firstPrefixRuns.length) {
      const last = firstPrefixRuns[firstPrefixRuns.length - 1];
      caretRunId = last.id;
      caretOffset = last.type === 'text' ? last.value.length : 0;
    } else if (lastSuffixSurvivor) {
      caretRunId = lastSuffixSurvivor.id;
      caretOffset = 0;
    } else if (lastSuffixRuns.length) {
      caretRunId = lastSuffixRuns[0].id;
      caretOffset = 0;
    } else {
      caretRunId = finalRuns[0].id;
      caretOffset = 0;
    }
  } else {
    const firstFinalRuns = firstSurvivors.length ? firstSurvivors : [blankRun()];
    ops.push(setBlockRuns(firstBlockId, firstFinalRuns));
    ops.push(setBlockRuns(lastBlockId, lastSurvivors.length ? lastSurvivors : [blankRun()]));
    survivingBlockId = firstBlockId;

    if (firstPrefixSurvivor) {
      caretRunId = firstPrefixSurvivor.id;
      caretOffset = firstPrefixSurvivor.value.length;
    } else if (firstPrefixRuns.length) {
      const last = firstPrefixRuns[firstPrefixRuns.length - 1];
      caretRunId = last.id;
      caretOffset = last.type === 'text' ? last.value.length : 0;
    } else {
      caretRunId = firstFinalRuns[0].id;
      caretOffset = 0;
    }
  }

  applyOps(store, ops);
  return { blockId: survivingBlockId, runId: caretRunId, offset: caretOffset };
}

/**
 * Deletes every top-level block under the document root and leaves one
 * paragraph behind (blank, or seeded with `replacementText` — typing a
 * character over a "whole document selected" state replaces it, matching
 * the standard "type over a selection" convention). Deliberately its own,
 * much simpler function rather than routed through deleteOverBlockRange:
 * a whole-document deletion never needs partial-boundary trimming (unlike
 * a cross-sibling-block selection, which stops mid-run at each end), and
 * the top-level blocks can be *any* type — including containers like
 * tables that don't have a run-based content list at all — so there's
 * nothing to trim at the boundaries in the first place, only whole blocks
 * to remove.
 *
 * One atomic undo step. Returns `{ blockId, runId, offset }` for the
 * resulting caret position, or null if the document was already empty.
 */
export function deleteEntireDocument(store, replacementText = '') {
  const rootId = store.getRootId();
  const contentIds = store.getBlock(rootId)?.contentIds ?? [];
  if (contentIds.length === 0) return null;

  const ops = contentIds.map((id) => removeBlock(id));
  const { block: fallbackBlock, runs } = createTextLeafBlock('paragraph')(rootId);
  if (replacementText) runs[0].value = replacementText;
  ops.push(insertBlock(fallbackBlock, rootId, 0, { blocks: [fallbackBlock], runs }));

  applyOps(store, ops);
  return { blockId: fallbackBlock.id, runId: fallbackBlock.contentIds[0], offset: replacementText.length };
}
