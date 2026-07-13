import { focusRunAtOffset } from './focusRun.js';
import { focusBlockStart } from '../blocks/shared/navigationCommands.js';

/**
 * Moves the caret to wherever the undo/redo that was just performed should
 * leave it — call this right after a truthy store.undo()/store.redo().
 * Prefers the precise {runId, offset} History derives for a plain text-run
 * edit; falls back to the start of the first still-existing block the
 * entry touched for structural edits (insert/remove/move block, etc.),
 * which don't reduce to one offset but still shouldn't leave focus
 * dangling on whatever had it before (usually a toolbar button, or a DOM
 * node a delete/undo just replaced outright).
 */
export function restoreSelectionAfterHistoryChange(store) {
  const selection = store.getPendingSelection?.();
  if (selection) {
    focusRunAtOffset(selection.runId, selection.offset);
    return;
  }

  const affectedIds = store.getPendingAffectedBlockIds?.() ?? [];
  const targetBlockId = affectedIds.find((id) => store.getBlock(id));
  if (targetBlockId) focusBlockStart(store, targetBlockId);
}
