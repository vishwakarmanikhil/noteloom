import { genId } from '../utils/idGen.js';
import { replaceRunSpan } from '../store/operations.js';

const BOOLEAN_MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code'];
const VALUE_MARK_NAMES = ['color', 'highlight', 'link'];

function getBlockRunIds(store, blockId) {
  const block = store.getBlock(blockId);
  return block.props?.titleRunIds ?? block.contentIds;
}

// Object-valued marks (link: {href, target}) can be equal in content but
// different references — e.g. after undo/redo, or a copy-pasted link — so
// plain === would spuriously read as "mixed" even when every run in range
// really does carry the same link. Primitive marks (color/highlight) are
// unaffected: === already succeeds for them before this ever falls through.
function sameMarkValue(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function summarizeMarks(runs) {
  const summary = {};
  if (runs.length === 0) return summary;
  for (const name of BOOLEAN_MARK_NAMES) {
    summary[name] = runs.every((r) => r.marks?.[name]);
  }
  for (const name of VALUE_MARK_NAMES) {
    const first = runs[0].marks?.[name] ?? null;
    summary[name] = runs.every((r) => sameMarkValue(r.marks?.[name] ?? null, first)) ? first : null;
  }
  return summary;
}

/**
 * Summarizes which marks are uniformly active across a same-block
 * selection — used by the floating toolbar to show a button as "pressed"
 * only when the *entire* selection already has that mark (the same
 * all-or-nothing convention toggleMarkOverSelection's own enable/disable
 * decision uses), and to read the current color/highlight value when it's
 * consistent across the whole selection (null when mixed or unset).
 */
export function getMarksSummaryOverSelection(store, blockId, selection) {
  const { startRunId, startOffset, endRunId, endOffset } = selection;
  const runIds = getBlockRunIds(store, blockId);
  const startIndex = runIds.indexOf(startRunId);
  const endIndex = runIds.indexOf(endRunId);
  if (startIndex === -1 || endIndex === -1) return {};
  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const runs = runIds
    .slice(fromIndex, toIndex + 1)
    .map((id) => store.getRun(id))
    .filter((r) => r && r.type === 'text');
  return summarizeMarks(runs);
}

/**
 * Same idea as getMarksSummaryOverSelection but for a cross-block range.
 * Approximates by including every text run in every block the range
 * touches (not clipped to the exact sub-range within the first/last
 * block) — fine for a toolbar's "is this button pressed" indicator, which
 * doesn't need character-level precision; the actual mutation
 * (setMarksOverBlockRange) is exact.
 */
export function getMarksSummaryOverBlockRange(store, crossSelection) {
  const { blockIds, startBlockId, endBlockId } = crossSelection;
  const startBlockIndex = blockIds.indexOf(startBlockId);
  const endBlockIndex = blockIds.indexOf(endBlockId);
  if (startBlockIndex === -1 || endBlockIndex === -1) return {};
  const [fromBlockIndex, toBlockIndex] =
    startBlockIndex <= endBlockIndex ? [startBlockIndex, endBlockIndex] : [endBlockIndex, startBlockIndex];

  const runs = [];
  for (let i = fromBlockIndex; i <= toBlockIndex; i += 1) {
    for (const id of getBlockRunIds(store, blockIds[i])) {
      const run = store.getRun(id);
      if (run && run.type === 'text') runs.push(run);
    }
  }
  return summarizeMarks(runs);
}

/** Applies a {markName: value} patch to a marks object — value === null/undefined removes that key, anything else sets it. */
function applyMarksPatch(marks, marksPatch) {
  const next = { ...marks };
  for (const [markName, value] of Object.entries(marksPatch)) {
    if (value != null) next[markName] = value;
    else delete next[markName];
  }
  return next;
}

/** Splits one run at [from, to) and applies `marksPatch` to the middle slice; the rest keeps its existing marks. */
function applyPatchToSingleRun(store, blockId, run, from, to, marksPatch) {
  const nextMarks = applyMarksPatch(run.marks, marksPatch);

  if (from === 0 && to === run.value.length) {
    store.applyOperation({ type: 'updateRun', id: run.id, patch: { marks: nextMarks } });
    return run.id;
  }

  const before = run.value.slice(0, from);
  const middle = run.value.slice(from, to);
  const after = run.value.slice(to);

  const newRuns = [];
  if (before) newRuns.push({ id: genId(), type: 'text', value: before, marks: { ...run.marks } });
  const middleRun = { id: genId(), type: 'text', value: middle, marks: nextMarks };
  newRuns.push(middleRun);
  if (after) newRuns.push({ id: genId(), type: 'text', value: after, marks: { ...run.marks } });

  store.applyOperation(replaceRunSpan(blockId, [run.id], newRuns));
  return middleRun.id;
}

/**
 * Applies `marksPatch` — one or more `{markName: value}` entries, value
 * `null`/`undefined` meaning "remove this mark" and anything else meaning
 * "set it to this value" — across a run span within one block, which may
 * cover one run or several. Applying several marks in the same patch (e.g.
 * `{ superscript: true, subscript: null }`, so turning superscript on
 * always clears subscript in the same pass) matters because two *sequential*
 * calls would each independently split/replace runs and mint new ids, so
 * the second call's selection (addressed by run id) could already be stale
 * by the time it runs — one patch, one pass, no staleness window.
 *
 * Atomic (non-text) runs in the span are passed through untouched. This is
 * the shared primitive every mark command below (boolean toggle, or a
 * value-based mark like color/highlight) ultimately applies per block.
 */
function applyMarksPatchOverRunSpan(store, blockId, selection, marksPatch) {
  const { startRunId, startOffset, endRunId, endOffset } = selection;
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
    if (run.type !== 'text') return run.id;
    const from = Math.max(0, Math.min(fromOffset, toOffset));
    const to = Math.min(run.value.length, Math.max(fromOffset, toOffset));
    if (from === to) return run.id;
    return applyPatchToSingleRun(store, blockId, run, from, to, marksPatch);
  }

  const newRuns = [];
  let lastNewRunId = null;

  rangeRuns.forEach((run, i) => {
    if (run.type !== 'text') {
      newRuns.push(run); // atomic: pass through untouched
      lastNewRunId = run.id;
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

    const middleRun = { id: genId(), type: 'text', value: middle, marks: applyMarksPatch(run.marks, marksPatch) };
    newRuns.push(middleRun);
    lastNewRunId = middleRun.id;

    if (after) newRuns.push({ id: genId(), type: 'text', value: after, marks: { ...run.marks } });
  });

  store.applyOperation(replaceRunSpan(blockId, rangeRunIds, newRuns));
  return lastNewRunId;
}

/** Whether every *text* run covered by the range already has the mark (decides enable vs disable for a boolean toggle). */
function computeShouldEnableForRange(store, blockId, selection, markName) {
  const { startRunId, startOffset, endRunId, endOffset } = selection;
  const runIds = getBlockRunIds(store, blockId);
  const startIndex = runIds.indexOf(startRunId);
  const endIndex = runIds.indexOf(endRunId);
  if (startIndex === -1 || endIndex === -1) return true;
  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const textRuns = runIds
    .slice(fromIndex, toIndex + 1)
    .map((id) => store.getRun(id))
    .filter((r) => r.type === 'text');
  if (textRuns.length === 0) return true;
  if (fromIndex === toIndex) {
    const from = Math.max(0, Math.min(startOffset, endOffset));
    const to = Math.min(textRuns[0].value.length, Math.max(startOffset, endOffset));
    if (from === to) return !textRuns[0].marks?.[markName]; // collapsed: mirror toggleMarkOnRunRange's convention
  }
  return !textRuns.every((r) => r.marks?.[markName]);
}

/**
 * Toggles `markName` on the [startOffset, endOffset) slice of one run's
 * text. Kept as a direct single-run entry point (used when the caller
 * already knows it's exactly one run) — internally now just computes the
 * enable/disable decision and delegates to applyPatchToSingleRun.
 *
 * Returns the id of the run that now contains the toggled middle segment
 * (or the whole run, if no split was needed) — useful for restoring focus.
 */
export function toggleMarkOnRunRange(store, blockId, runId, startOffset, endOffset, markName) {
  const run = store.getRun(runId);
  const value = run.value ?? '';
  const from = Math.max(0, Math.min(startOffset, endOffset));
  const to = Math.min(value.length, Math.max(startOffset, endOffset));
  if (from === to) return runId; // collapsed selection: nothing to toggle

  const shouldEnable = !run.marks?.[markName];
  return applyPatchToSingleRun(store, blockId, run, from, to, { [markName]: shouldEnable ? true : null });
}

/**
 * Applies an explicit `{markName: value}` patch (see applyMarksPatchOverRunSpan)
 * over a selection within one block — the entry point for value-based marks
 * (color/highlight, set to a specific picked value) and for any mark whose
 * enable/disable decision the caller has already made (e.g. clearing the
 * opposite of a mutually-exclusive pair like subscript/superscript
 * alongside setting the one being turned on, in the same pass).
 */
export function setMarksOverSelection(store, blockId, selection, marksPatch) {
  return applyMarksPatchOverRunSpan(store, blockId, selection, marksPatch);
}

/**
 * Toggles `markName` over a selection that may span *multiple runs within
 * the same block* — e.g. selecting "ello wor" across "h[ello] [wor]ld" where
 * the middle word already had a different mark boundary. Atomic (non-text)
 * runs caught in the range are passed through unchanged; marks don't apply
 * to them.
 *
 * The whole-range mark state (enable vs disable) is decided by whether
 * every *text* run currently in range already has the mark: if so, this
 * toggle removes it from all of them; otherwise it adds it to all of them
 * — the standard "toggle bold over a mixed selection turns it fully on"
 * rich-text convention.
 *
 * Scope: the selection must resolve to a single block (see
 * resolveMultiRunSelection). A selection spanning multiple blocks is
 * handled by toggleMarkOverBlockRange instead.
 */
export function toggleMarkOverSelection(store, blockId, selection, markName) {
  const shouldEnable = computeShouldEnableForRange(store, blockId, selection, markName);
  return setMarksOverSelection(store, blockId, selection, { [markName]: shouldEnable ? true : null });
}

/**
 * Toggles `markName` over a selection spanning *multiple sibling blocks*
 * (e.g. selecting from the middle of one paragraph through the middle of
 * another, a few blocks down). `crossSelection` comes from
 * resolveCrossBlockSelection: `{ blockIds, startBlockId, startRunId,
 * startOffset, endBlockId, endRunId, endOffset }`, where blockIds is the
 * ordered sibling range under a shared parent.
 *
 * The enable/disable decision is computed ONCE across every text run
 * actually spanned in the whole range (not per block), so toggling bold
 * across three paragraphs turns it fully on/off consistently everywhere,
 * matching toggleMarkOverSelection's same-block convention.
 *
 * Each affected block gets its own REPLACE_RUN_SPAN operation — this is
 * correct but not a single atomic undo step; undoing a cross-block toggle
 * currently takes one undo press per affected block. Fully atomic
 * cross-block undo is a further follow-up.
 */
export function toggleMarkOverBlockRange(store, crossSelection, markName) {
  return setMarksOverBlockRange(store, crossSelection, (allMarked) => ({ [markName]: allMarked ? null : true }), markName);
}

/**
 * Same shape as toggleMarkOverBlockRange, but for an explicit marks patch
 * rather than a single boolean toggle — `marksPatchOrFn` is either a plain
 * `{markName: value}` object (applied identically to every affected block,
 * e.g. a color pick) or a function `(allMarked) => marksPatch` when the
 * patch itself depends on the toggle decision (mirrors
 * toggleMarkOverBlockRange's own "decide once across the whole range"
 * semantics — `markNameForDecision` is which mark's presence decides
 * `allMarked`, defaulting to the lookup used by the boolean-toggle case).
 */
export function setMarksOverBlockRange(store, crossSelection, marksPatchOrFn, markNameForDecision) {
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

  let marksPatch = marksPatchOrFn;
  if (typeof marksPatchOrFn === 'function') {
    let sawText = false;
    let allMarked = true;
    for (let i = fromBlockIndex; i <= toBlockIndex; i += 1) {
      const runs = getBlockRunIds(store, blockIds[i])
        .map((id) => store.getRun(id))
        .filter((r) => r.type === 'text');
      if (runs.length === 0) continue;
      sawText = true;
      if (!runs.every((r) => r.marks?.[markNameForDecision])) allMarked = false;
    }
    marksPatch = marksPatchOrFn(sawText && allMarked);
  }

  if (fromBlockIndex === toBlockIndex) {
    return setMarksOverSelection(
      store,
      blockIds[fromBlockIndex],
      { startRunId: firstRunId, startOffset: firstOffset, endRunId: lastRunId, endOffset: lastOffset },
      marksPatch,
    );
  }

  let lastNewRunId = null;
  for (let i = fromBlockIndex; i <= toBlockIndex; i += 1) {
    const blockId = blockIds[i];
    const runIds = getBlockRunIds(store, blockId);
    const blockFirstRunId = runIds[0];
    const blockLastRunId = runIds[runIds.length - 1];
    const blockLastRun = store.getRun(blockLastRunId);
    const blockLastOffset = blockLastRun?.value?.length ?? 0;

    let selection;
    if (i === fromBlockIndex && i === toBlockIndex) {
      selection = { startRunId: firstRunId, startOffset: firstOffset, endRunId: lastRunId, endOffset: lastOffset };
    } else if (i === fromBlockIndex) {
      selection = { startRunId: firstRunId, startOffset: firstOffset, endRunId: blockLastRunId, endOffset: blockLastOffset };
    } else if (i === toBlockIndex) {
      selection = { startRunId: blockFirstRunId, startOffset: 0, endRunId: lastRunId, endOffset: lastOffset };
    } else {
      selection = { startRunId: blockFirstRunId, startOffset: 0, endRunId: blockLastRunId, endOffset: blockLastOffset };
    }

    lastNewRunId = setMarksOverSelection(store, blockId, selection, marksPatch);
  }

  return lastNewRunId;
}
