import { updateRun } from '../../store/operations.js';
import { convertBlockType } from '../shared/convertBlockType.js';
import { focusRunStart } from '../../react/focusRun.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

// Markdown shortcuts: a recognized prefix, typed at the
// very start of an otherwise-plain paragraph, converts the block once the
// pattern is complete — most need a trailing trigger space ("# ", "- ",
// "1. ", "> ", "[] "), matching every other editor's convention that the
// space itself commits the conversion (so "#" alone, mid-typing, doesn't
// convert early); "```" has no trailing space since there's nothing after
// the third backtick to wait for.
//
// The trigger character class is `[  ]`, not a literal " " — browsers
// commonly insert a *non-breaking* space (U+00A0) instead of an ordinary
// one for a trailing space in a contentEditable region (so it doesn't get
// collapsed away by normal HTML whitespace rules), and every one of these
// shortcuts' trigger is exactly that: the last character in the region at
// the moment it's typed. Matching only a literal " " meant none of these
// ever fired against real typed input, only against text set up directly
// in a test — jsdom doesn't reproduce this browser quirk, which is why it
// wasn't caught there.
const RULES = [
  { re: /^(#{1,3})[  ]$/, type: 'heading', props: (m) => ({ level: m[1].length }) },
  { re: /^[-*][  ]$/, type: 'listItem', props: () => ({ ordered: false, titleRunIds: [] }) },
  { re: /^\d+\.[  ]$/, type: 'listItem', props: () => ({ ordered: true, titleRunIds: [] }) },
  { re: /^\[\][  ]$/, type: 'listItem', props: () => ({ ordered: false, checked: false, titleRunIds: [] }) },
  { re: /^>[  ]$/, type: 'blockquote', props: () => ({}) },
  { re: /^```$/, type: 'code', props: () => ({ language: 'plaintext' }) },
];

/**
 * Checks the block's current run list against every rule above and, on a
 * match, converts it: strips the matched prefix from the first run's text
 * and swaps the block for the matching type via convertBlockType, carrying
 * over the (now-stripped) run so any text/marks typed after the prefix
 * survive — all as one atomic undo step. Only fires when the block's
 * ENTIRE content is a single plain text run (no marks/atomic runs mixed in
 * yet); typing the same characters mid-sentence, or spanning multiple
 * runs, never triggers it — scoped to a fresh, still-plain line.
 *
 * `runs` is the block's just-committed run list (see EditableBlockContent's
 * handleInput, onlyValueChanges path — a markdown shortcut is always typed
 * into a single existing run, never a structural DOM change). Returns
 * `true` if a conversion happened (the caller should treat blockId as gone
 * — a new block now occupies its place).
 */
export function applyMarkdownShortcut(store, blockId, runs) {
  if (runs.length !== 1 || runs[0].type !== 'text') return false;
  const value = runs[0].value ?? '';

  for (const rule of RULES) {
    const match = rule.re.exec(value);
    if (!match) continue;

    const strippedValue = value.slice(match[0].length);
    const { ops } = convertBlockType(store, blockId, rule.type, rule.props(match), [runs[0].id]);
    applyOps(store, [updateRun(runs[0].id, { value: strippedValue }), ...ops]);
    focusRunStart(runs[0].id);
    return true;
  }
  return false;
}
