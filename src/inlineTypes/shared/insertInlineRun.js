import { genId } from '../../utils/idGen.js';
import { replaceRunSpan } from '../../store/operations.js';
import { focusRunEnd } from '../../react/focusRun.js';

/**
 * Splices a newly-created inline run in at the *exact* cursor position
 * (sliceStart/sliceEnd bracket the "/query" text that triggered it) —
 * splitting the triggering run into three: whatever came before the "/",
 * the new atomic chip, and whatever came after the cursor. This is what
 * makes the chip land where you actually typed "/", not always at the end
 * of the block — a run with only "before" text and no "after" (cursor was
 * at the end) still gets an empty trailing run so there's somewhere to
 * keep typing past the chip. The "before" run keeps the original run's id
 * so its DOM span isn't remounted.
 */
export function insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, createInlineRun) {
  const currentRun = store.getRun(runId);
  const value = currentRun?.value ?? '';
  const beforeText = value.slice(0, sliceStart);
  const afterText = value.slice(sliceEnd);

  const inlineRun = createInlineRun();
  const beforeRun = { ...currentRun, value: beforeText };
  const afterRun = { id: genId(), type: 'text', value: afterText, marks: { ...currentRun?.marks } };

  store.applyOperation(replaceRunSpan(blockId, [runId], [beforeRun, inlineRun, afterRun]));
  focusRunEnd(afterRun.id);
}
