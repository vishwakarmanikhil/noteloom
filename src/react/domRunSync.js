import { genId } from '../utils/idGen.js';

/**
 * A completely empty `<span></span>` (no text node at all) is not a valid
 * caret anchor in many browsers' contentEditable implementation: clicking
 * into it places the caret at the *container* level instead, and typing
 * then inserts a brand-new text node as a *sibling* of the empty span
 * rather than inside it. That stray node is never one React created, so it
 * becomes invisible to React's reconciliation from that point on — every
 * subsequent keystroke reads a DOM that's drifted further from what React
 * thinks it rendered, which is what produced runaway duplicated/shrinking
 * text. The fix (the same one Slate/Lexical use) is to never render a
 * truly empty text node: an empty run gets this zero-width-space
 * placeholder instead, giving the browser a real anchor, and it's stripped
 * back out whenever DOM text is read back into a run's logical value.
 */
export const EMPTY_RUN_PLACEHOLDER = '​';

const ZERO_WIDTH_SPACE_RE = /​/g;

/** Strips the placeholder out of a string, however many times it appears. */
export function stripEmptyRunPlaceholder(text) {
  return (text ?? '').replace(ZERO_WIDTH_SPACE_RE, '');
}

function readRunText(node) {
  return stripEmptyRunPlaceholder(node.textContent);
}

/**
 * Reconciles a contentEditable container's *actual current* child nodes
 * back against the run list it was last rendered with. This is what makes
 * one shared contentEditable region per block work: React renders each run
 * as a child (a plain `<span data-run-id>` for text, an atomic
 * `contentEditable={false}` island for a non-text inline type), the browser
 * mutates that DOM natively as the user types/deletes/pastes, and this
 * function reads the result back into run objects on the container's
 * `input` event.
 *
 * Fast path (`onlyValueChanges: true`): every child still has the same
 * data-run-id, in the same order, and only text values differ — the
 * common case for ordinary typing, since the browser's native text edit
 * stays inside the existing span whose data-run-id attribute survives
 * untouched. Callers should apply per-run `updateRun` ops in this case, to
 * preserve History's per-run undo coalescing.
 *
 * Slow path (`onlyValueChanges: false`): node(s) appeared/disappeared/
 * reordered — e.g. paste, IME composition boundaries, or an atomic inline
 * chip being deleted as a whole unit. Callers should apply one
 * `setBlockRuns` op (see operations.js) as a single coarser undo step.
 *
 * Atomic (non-text) runs are matched by id only and never have their value
 * re-derived from DOM text content — they render their own UI, not plain
 * text, so `textContent` isn't a meaningful "value" for them.
 */
export function reconcileDomToRuns(containerEl, currentRuns) {
  const byId = new Map(currentRuns.map((run) => [run.id, run]));
  const seen = new Set();
  const nextRuns = [];
  let sameIdentityAndOrder = true;

  for (const node of containerEl.childNodes) {
    const runId = node.nodeType === 1 ? node.dataset?.runId : undefined;

    if (runId && byId.has(runId)) {
      seen.add(runId);
      const existing = byId.get(runId);

      if (existing.type !== 'text') {
        nextRuns.push(existing); // atomic: identity-only, never re-derive from DOM
        continue;
      }

      const newValue = readRunText(node);
      nextRuns.push(newValue === existing.value ? existing : { ...existing, value: newValue });
      continue;
    }

    // No existing run matches this DOM node at all: a structural change
    // (new text node from typing at a boundary, paste, IME, etc.).
    sameIdentityAndOrder = false;
    const text = readRunText(node);
    if (text) nextRuns.push({ id: genId(), type: 'text', value: text, marks: {} });
  }

  if (currentRuns.some((run) => !seen.has(run.id))) sameIdentityAndOrder = false; // a run's node vanished
  if (nextRuns.length !== currentRuns.length) sameIdentityAndOrder = false;
  if (sameIdentityAndOrder) {
    for (let i = 0; i < nextRuns.length; i += 1) {
      if (nextRuns[i].id !== currentRuns[i].id) {
        sameIdentityAndOrder = false;
        break;
      }
    }
  }

  const changed = !sameIdentityAndOrder || nextRuns.some((run, i) => run !== currentRuns[i]);

  return { runs: nextRuns, changed, onlyValueChanges: sameIdentityAndOrder };
}
