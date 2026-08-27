import { updateRun } from '../store/operations.js';

function isWordChar(ch) {
  return ch != null && /[\w]/.test(ch);
}

/** Checks that `haystack[start..start+length)` isn't part of a larger word — both neighboring characters (if any) are non-word characters. */
function isWholeWordMatch(haystack, start, length) {
  const before = haystack[start - 1];
  const after = haystack[start + length];
  return !isWordChar(before) && !isWordChar(after);
}

function scanRun(store, blockId, runId, needle, options, results, knownRun) {
  const run = knownRun ?? store.getRun(runId);
  if (!run || run.type !== 'text' || !run.value) return;
  const haystack = options.caseSensitive ? run.value : run.value.toLowerCase();

  let from = 0;
  while (true) {
    const found = haystack.indexOf(needle, from);
    if (found === -1) break;
    if (!options.wholeWord || isWholeWordMatch(haystack, found, needle.length)) {
      results.push({ blockId, runId, offset: found, length: needle.length });
    }
    from = found + needle.length; // non-overlapping, matches native browser find behavior
  }
}

/**
 * Depth-first, reading-order walk of the block/run tree, matching the exact
 * dual-path convention `captureSubtree` (clipboard/serialize.js) already
 * uses: each id in `block.contentIds` is tried as a run first (duck-typed
 * via `store.getRun`, no registry lookup needed) and, if it isn't one,
 * treated as a nested block instead. `block.props.titleRunIds` (listItem/
 * toggleHeading's own text, kept separate from `contentIds` — see those
 * types' own doc comments) is scanned first, so a list item's title is
 * found before its nested children, matching reading order.
 *
 * Only text runs are searched — a non-text run (a select/date/mention chip)
 * is opaque here, same "known limitation, documented" scope comments.js's
 * own `anchorRunIds` accepts for its own range tracking. A match can't span
 * two runs either (e.g. across a bold/italic boundary splitting the search
 * term) — v1 scope, most search terms are shorter than a formatting run.
 */
function walk(store, blockId, needle, options, results) {
  const block = store.getBlock(blockId);
  if (!block) return;

  for (const runId of block.props?.titleRunIds ?? []) {
    scanRun(store, blockId, runId, needle, options, results);
  }

  for (const childId of block.contentIds) {
    const run = store.getRun(childId);
    if (run) scanRun(store, blockId, childId, needle, options, results, run);
    else walk(store, childId, needle, options, results);
  }
}

/**
 * Finds every occurrence of `query` in the document, in reading order, as
 * `{ blockId, runId, offset, length }` — never a cross-run or non-text-run
 * match (see `walk`'s own doc comment for both limitations). `caseSensitive`
 * and `wholeWord` default to the common "just find my text" behavior
 * (case-insensitive, no word-boundary requirement).
 */
export function findMatches(store, query, { caseSensitive = false, wholeWord = false } = {}) {
  const results = [];
  if (!query) return results;
  const needle = caseSensitive ? query : query.toLowerCase();
  walk(store, store.getRootId(), needle, { caseSensitive, wholeWord }, results);
  return results;
}

/** Replaces one match's own slice of its run's text with `replacement` — one atomic undo step. */
export function replaceMatch(store, match, replacement) {
  const run = store.getRun(match.runId);
  if (!run) return;
  const value = run.value ?? '';
  const newValue =
    value.slice(0, match.offset) + replacement + value.slice(match.offset + match.length);
  store.applyOperation(updateRun(match.runId, { value: newValue }));
}

/**
 * Replaces every given match with `replacement`, one store write per
 * AFFECTED RUN (not per match) — several matches can land in the same run
 * (e.g. searching "the" in "the theory of the thing"), so each run's
 * matches are applied right-to-left against a single local string before
 * writing it once, keeping earlier offsets in that same run valid as later
 * ones are replaced. One atomic undo step for the whole operation via
 * `performBatch`, same convention `useClipboardHandlers`' multi-block paste
 * already uses.
 */
export function replaceAllMatches(store, matches, replacement) {
  const byRun = new Map();
  for (const match of matches) {
    if (!byRun.has(match.runId)) byRun.set(match.runId, []);
    byRun.get(match.runId).push(match);
  }

  const ops = [];
  for (const [runId, runMatches] of byRun) {
    const run = store.getRun(runId);
    if (!run) continue;
    let value = run.value ?? '';
    const rightToLeft = [...runMatches].sort((a, b) => b.offset - a.offset);
    for (const match of rightToLeft) {
      value = value.slice(0, match.offset) + replacement + value.slice(match.offset + match.length);
    }
    ops.push(updateRun(runId, { value }));
  }
  if (ops.length === 0) return;

  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}
