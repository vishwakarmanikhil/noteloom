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

/** Best-effort: move DOM focus + caret to a specific character offset within the given (text) run. */
export function focusRunAtOffset(runId, offset) {
  requestAnimationFrame(() => {
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
  });
}
