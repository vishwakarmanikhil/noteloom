function setCaretAtOffsetNow(runId, offset) {
  const el = document.querySelector(`[data-run-id="${runId}"]`);
  if (!el) return;
  el.focus();
  const textNode = el.firstChild;
  const range = document.createRange();
  if (textNode && textNode.nodeType === 3) {
    const clamped = Math.max(0, Math.min(offset, textNode.length));
    range.setStart(textNode, clamped);
    range.setEnd(textNode, clamped);
  } else {
    range.selectNodeContents(el);
    range.collapse(offset <= 0);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function focusRunAt(runId, atStart) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(atStart);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

/** Best-effort: move DOM focus + caret to the end of the given run's editable element. */
export function focusRunEnd(runId) {
  focusRunAt(runId, false);
}

/** Best-effort: move DOM focus + caret to the start of the given run's editable element. */
export function focusRunStart(runId) {
  focusRunAt(runId, true);
}

/**
 * Best-effort: move DOM focus + caret to a specific character offset within
 * the given (text) run — deferred to the next animation frame, since most
 * callers use this right after a structural change (a new block/run that
 * may not exist in the DOM yet on this exact tick).
 */
export function focusRunAtOffset(runId, offset) {
  requestAnimationFrame(() => setCaretAtOffsetNow(runId, offset));
}

/**
 * Synchronous (no requestAnimationFrame) variant of focusRunAtOffset —
 * for the one call site (voice dictation's live interim-text hot path,
 * see useVoiceTyping.js) where the target run's DOM node is already
 * known to exist and has *already* been synchronously rewritten by the
 * time this is called. Deferring here would leave a window where a
 * rapid-fire next event reads the selection before it's been fixed,
 * which is exactly the caret-corruption bug this exists to avoid — every
 * other call site should keep using the rAF-deferred focusRunAtOffset
 * above.
 */
export function setCaretSync(runId, offset) {
  setCaretAtOffsetNow(runId, offset);
}
