import { genId } from '../utils/idGen.js';
import { replaceRunSpan } from '../store/operations.js';

function getBlockRunIds(store, blockId) {
  const block = store.getBlock(blockId);
  return block.props?.titleRunIds ?? block.contentIds;
}

/** Appends `commentId` to a run's `marks.commentIds`, idempotently -- never clobbers other marks or other comment ids already on the run. */
function appendCommentMark(marks, commentId) {
  const existing = marks?.commentIds ?? [];
  if (existing.includes(commentId)) return marks ?? {};
  return { ...marks, commentIds: [...existing, commentId] };
}

/** Removes `commentId` from a run's `marks.commentIds`, dropping the key entirely once empty. */
function removeCommentMark(marks, commentId) {
  const existing = marks?.commentIds ?? [];
  if (!existing.includes(commentId)) return marks ?? {};
  const next = { ...marks };
  const remaining = existing.filter((id) => id !== commentId);
  if (remaining.length > 0) next.commentIds = remaining;
  else delete next.commentIds;
  return next;
}

/** Same single-run split as markCommands.js's applyPatchToSingleRun, but appending a comment id instead of applying a flat marks patch -- see this module's own doc comment for why it isn't shared with markCommands.js. Returns the op to apply (never applies it itself -- see addCommentMarkOverRange). */
function appendCommentToSingleRunOp(blockId, run, from, to, commentId) {
  const nextMarks = appendCommentMark(run.marks, commentId);

  if (from === 0 && to === run.value.length) {
    return { type: 'updateRun', id: run.id, patch: { marks: nextMarks } };
  }

  const before = run.value.slice(0, from);
  const middle = run.value.slice(from, to);
  const after = run.value.slice(to);

  const newRuns = [];
  if (before) newRuns.push({ id: genId(), type: 'text', value: before, marks: { ...run.marks } });
  newRuns.push({ id: genId(), type: 'text', value: middle, marks: nextMarks });
  if (after) newRuns.push({ id: genId(), type: 'text', value: after, marks: { ...run.marks } });

  return replaceRunSpan(blockId, [run.id], newRuns);
}

/**
 * Computes the single operation that marks every run (or run slice) within
 * `{ blockId, startRunId, startOffset, endRunId, endOffset }` as belonging
 * to `commentId`, by appending it to each affected run's `marks.commentIds`
 * array -- but does NOT apply it (returns the op, or `null` for a
 * collapsed/unresolvable range), so callers (see src/comments/comments.js's
 * addComment) can batch it with the comment-thread-creation op as one
 * atomic undo step via `store.performBatch`.
 *
 * Mirrors markCommands.js's applyMarksPatchOverRunSpan's run-resolution/
 * splitting logic, but is a deliberately separate, new function rather
 * than a change to that shared, well-tested mark-toggle path -- marks
 * today are a flat `next[markName] = value` replace (see markCommands.js's
 * own applyMarksPatch), and comments need *append* semantics since
 * multiple comments can overlap the same text.
 *
 * The resulting op is an ordinary `replaceRunSpan`/`updateRun` -- the same
 * ops every other formatting command already uses, with the same
 * pre-existing local-only-in-collaboration scope (see EditorStore's
 * REPLACE_RUN_SPAN case) rather than a new op type.
 */
export function addCommentMarkOverRange(store, { blockId, startRunId, startOffset, endRunId, endOffset }, commentId) {
  const runIds = getBlockRunIds(store, blockId);
  const startIndex = runIds.indexOf(startRunId);
  const endIndex = runIds.indexOf(endRunId);
  if (startIndex === -1 || endIndex === -1) return null;

  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const fromOffset = startIndex <= endIndex ? startOffset : endOffset;
  const toOffset = startIndex <= endIndex ? endOffset : startOffset;

  const rangeRunIds = runIds.slice(fromIndex, toIndex + 1);
  const rangeRuns = rangeRunIds.map((id) => store.getRun(id));

  if (fromIndex === toIndex) {
    const run = rangeRuns[0];
    if (run.type !== 'text') return null;
    const from = Math.max(0, Math.min(fromOffset, toOffset));
    const to = Math.min(run.value.length, Math.max(fromOffset, toOffset));
    if (from === to) return null;
    return appendCommentToSingleRunOp(blockId, run, from, to, commentId);
  }

  const newRuns = [];
  rangeRuns.forEach((run, i) => {
    if (run.type !== 'text') {
      newRuns.push(run); // atomic: pass through untouched
      return;
    }

    const isFirst = i === 0;
    const isLast = i === rangeRuns.length - 1;
    const sliceStart = isFirst ? fromOffset : 0;
    const sliceEnd = isLast ? toOffset : run.value.length;

    const before = run.value.slice(0, sliceStart);
    const middle = run.value.slice(sliceStart, sliceEnd);
    const after = run.value.slice(sliceEnd);

    if (before) newRuns.push({ id: genId(), type: 'text', value: before, marks: { ...run.marks } });
    newRuns.push({ id: genId(), type: 'text', value: middle, marks: appendCommentMark(run.marks, commentId) });
    if (after) newRuns.push({ id: genId(), type: 'text', value: after, marks: { ...run.marks } });
  });

  return replaceRunSpan(blockId, rangeRunIds, newRuns);
}

/**
 * Computes the ops that strip `commentId` from every run in the whole
 * document that carries it (via store.getAllRunIds(), not just the range
 * it was originally added over -- a later formatting edit may have split/
 * re-minted run ids since, see the package README's documented limitation
 * on `anchorRunIds`) -- does NOT apply them (returns the op list), for the
 * same batching reason as addCommentMarkOverRange (see src/comments/
 * comments.js's deleteComment). Each op is a plain `updateRun({ marks })`
 * -- `marks` is a whole-field LWW key (only a text run's lone `value` key
 * is routed through the character CRDT), so this is the same primitive
 * every other mark removal already uses.
 */
export function removeCommentMarkEverywhere(store, commentId) {
  const ops = [];
  for (const runId of store.getAllRunIds()) {
    const run = store.getRun(runId);
    if (!run?.marks?.commentIds?.includes(commentId)) continue;
    ops.push({ type: 'updateRun', id: runId, patch: { marks: removeCommentMark(run.marks, commentId) } });
  }
  return ops;
}
