import { focusRunEnd } from '../../react/focusRun.js';
import { resolveAdjacentFocusTarget } from '../shared/navigationCommands.js';
import { insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

function locateCell(store, cellId) {
  const cell = store.getBlock(cellId);
  const row = store.getBlock(cell.parentId);
  const table = store.getBlock(row.parentId);
  return { table, row, rowIndex: table.contentIds.indexOf(row.id), colIndex: row.contentIds.indexOf(cellId) };
}

/**
 * Resolves the target cell id when moving from `cellId` in `direction`
 * ('left' | 'right' | 'up' | 'down'). Pure, no side effects — returns null
 * at any of the table's edges (first/last cell of a row, top/bottom of a
 * column), leaving what to do about that boundary to the caller
 * (moveToAdjacentCell).
 *
 * 'up'/'down' stay in the same column and return null at the table's
 * top/bottom edge — moving out of the table into a sibling block above/below
 * it is a follow-up (same cross-container caveat as navigationCommands.js).
 */
export function resolveAdjacentCellTarget(store, cellId, direction) {
  const { table, row, rowIndex, colIndex } = locateCell(store, cellId);

  if (direction === 'left' || direction === 'right') {
    const delta = direction === 'right' ? 1 : -1;
    const nextColIndex = colIndex + delta;
    if (nextColIndex >= 0 && nextColIndex < row.contentIds.length) {
      return row.contentIds[nextColIndex];
    }

    const nextRowIndex = rowIndex + delta;
    if (nextRowIndex < 0 || nextRowIndex >= table.contentIds.length) return null; // at the table's very first/last cell

    const targetRow = store.getBlock(table.contentIds[nextRowIndex]);
    const targetColIndex = direction === 'right' ? 0 : targetRow.contentIds.length - 1;
    return targetRow.contentIds[targetColIndex];
  }

  const delta = direction === 'down' ? 1 : -1;
  const targetRowIndex = rowIndex + delta;
  if (targetRowIndex < 0 || targetRowIndex >= table.contentIds.length) return null;
  const targetRow = store.getBlock(table.contentIds[targetRowIndex]);
  return targetRow.contentIds[colIndex] ?? targetRow.contentIds[targetRow.contentIds.length - 1] ?? null;
}

/**
 * Tab past the table's very last cell exits it entirely — focuses whatever
 * block already follows the table (entering it the same way arrow-key
 * navigation between top-level blocks does), or, if the table is the last
 * block in its container, creates a fresh blank paragraph after it and
 * focuses that. Either way Tab always lands somewhere, never a silent
 * no-op that leaves the user stuck at the end of a document that happens
 * to end in a table.
 */
function exitTableForward(store, tableId) {
  const targetRunId = resolveAdjacentFocusTarget(store, tableId, 'down');
  if (targetRunId) {
    focusRunEnd(targetRunId);
    return;
  }
  insertSiblingAfterAndFocus(store, tableId, createTextLeafBlock('paragraph'));
}

/** Moves DOM focus to the adjacent cell resolved by resolveAdjacentCellTarget, or exits the table on Tab past its last cell (see exitTableForward). */
export function moveToAdjacentCell(store, cellId, direction) {
  const targetCellId = resolveAdjacentCellTarget(store, cellId, direction);
  if (targetCellId) {
    const targetCell = store.getBlock(targetCellId);
    const runId = targetCell?.contentIds?.[0];
    if (runId) focusRunEnd(runId);
    return;
  }

  if (direction === 'right') {
    const { table } = locateCell(store, cellId);
    exitTableForward(store, table.id);
  }
  // 'left' at the very first cell, and 'up'/'down' at the table's
  // top/bottom edge, remain a no-op (see resolveAdjacentCellTarget's doc
  // comment on that scope).
}
