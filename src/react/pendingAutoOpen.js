/**
 * A short-lived signal for "the inline run with this id was JUST inserted
 * from the slash/@ menu and its own picker should open immediately" (e.g.
 * a select/custom-select/mention chip opening straight into its search
 * input instead of leaving the caret in the trailing text run past it) —
 * see insertInlineRunAtCursor's `autoOpen` option.
 *
 * Deliberately NOT part of the run's persisted `data` — that would leak an
 * ephemeral UI intent into the document itself, surviving reloads, undo/
 * redo, and collaboration sync, none of which should reopen a picker that
 * already closed once. A run's id is consumed at most once, by whichever
 * component instance mounts first for it (its own initial mount right
 * after insertion) — a later remount of the same run id (undo/redo
 * re-creating it, a collaborating peer receiving it) finds nothing
 * pending and mounts closed, as normal.
 */
const pendingRunIds = new Set();

export function markPendingAutoOpen(runId) {
  pendingRunIds.add(runId);
}

export function consumePendingAutoOpen(runId) {
  if (!pendingRunIds.has(runId)) return false;
  pendingRunIds.delete(runId);
  return true;
}
