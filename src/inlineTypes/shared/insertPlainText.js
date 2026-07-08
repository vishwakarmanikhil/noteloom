import { updateRun } from '../../store/operations.js';
import { focusRunAtOffset } from '../../react/focusRun.js';

/**
 * Replaces the [sliceStart, sliceEnd) "/query" span in `runId`'s own text
 * with literal `text` — unlike insertInlineRunAtCursor, this never creates
 * a new run at all: the inserted content is ordinary text (an emoji
 * character), not an atomic chip, so it's just as selectable/deletable/
 * editable as anything else typed there. Used by the emoji slash commands.
 */
export function insertPlainTextAtCursor(store, { runId, sliceStart, sliceEnd }, text) {
  const run = store.getRun(runId);
  const value = run?.value ?? '';
  const newValue = value.slice(0, sliceStart) + text + value.slice(sliceEnd);
  store.applyOperation(updateRun(runId, { value: newValue }));
  focusRunAtOffset(runId, sliceStart + text.length);
}
