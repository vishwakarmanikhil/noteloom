import { removeBlock, insertBlock, updateBlockProps, setBlockRuns, updateRun } from '../../store/operations.js';
import { genId } from '../../utils/idGen.js';
import { focusBlockStart } from '../shared/navigationCommands.js';
import { ensureRootNonEmpty } from '../shared/ensureRootNonEmpty.js';
import { resolveColumns, createCellForColumn, convertRunToType, DEFAULT_COLUMN_TYPE } from './tableColumns.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/** Removes the whole table (used when deleting its last row/column) and focuses whatever's now at its old position. */
function removeTableAndFocusSibling(store, table) {
  const parent = store.getBlock(table.parentId);
  const tableIndex = parent.contentIds.indexOf(table.id);
  applyOps(store, [removeBlock(table.id)]);

  // The table may have been the only block in the whole document — never
  // leave the document with zero blocks (see ensureRootNonEmpty).
  const fallbackParagraphId = ensureRootNonEmpty(store);
  if (fallbackParagraphId) {
    focusBlockStart(store, fallbackParagraphId);
    return null;
  }

  const parentAfter = store.getBlock(table.parentId);
  const siblingId = parentAfter.contentIds[tableIndex] ?? parentAfter.contentIds[tableIndex - 1];
  if (siblingId) focusBlockStart(store, siblingId);
  return null;
}

/**
 * Inserts a new empty row right after `rowId`, with the same column count,
 * and focuses its first cell. Each new cell matches its own column's
 * configured type (see tableColumns.js) — a date/select/checkbox column
 * keeps getting date/select/checkbox cells for every row added after it
 * was typed, not a plain blank text cell.
 */
export function insertRowAfter(store, rowId) {
  const row = store.getBlock(rowId);
  const table = store.getBlock(row.parentId);
  const rowIndex = table.contentIds.indexOf(rowId);
  const columns = resolveColumns(table, row.contentIds.length);

  const newRowId = genId();
  const cellBlocks = [];
  const runs = [];
  const contentIds = [];
  for (const column of columns) {
    const cell = createCellForColumn(newRowId, column);
    cellBlocks.push(cell.block);
    runs.push(cell.run);
    contentIds.push(cell.block.id);
  }
  const newRow = { id: newRowId, type: 'tableRow', parentId: table.id, contentIds, props: {} };

  store.applyOperation(insertBlock(newRow, table.id, rowIndex + 1, { blocks: [newRow, ...cellBlocks], runs }));
  focusBlockStart(store, newRowId);
  return newRowId;
}

/**
 * Removes a row. If it's the table's only row, removes the whole table
 * instead (nothing left to show otherwise) and focuses the block now at
 * the table's old position. Otherwise focuses the row that ends up in the
 * same slot (the next row, or the new-last row if the deleted one was last).
 */
export function deleteRow(store, rowId) {
  const row = store.getBlock(rowId);
  const table = store.getBlock(row.parentId);

  if (table.contentIds.length <= 1) {
    return removeTableAndFocusSibling(store, table);
  }

  const rowIndex = table.contentIds.indexOf(rowId);
  applyOps(store, [removeBlock(rowId)]);

  const updatedTable = store.getBlock(table.id);
  const targetRowIndex = Math.min(rowIndex, updatedTable.contentIds.length - 1);
  const targetRowId = updatedTable.contentIds[targetRowIndex];
  if (targetRowId) focusBlockStart(store, targetRowId);
  return targetRowId ?? null;
}

/** Inserts a new (always plain-text) column at `colIndex + 1` in every row of the table, and focuses the first new cell. One atomic undo step, including the new column's metadata. */
export function insertColumnAfter(store, tableId, colIndex) {
  const table = store.getBlock(tableId);
  const currentColumns = resolveColumns(table, table.contentIds[0] ? store.getBlock(table.contentIds[0]).contentIds.length : 0);
  const newColumn = { id: genId(), label: 'New Column', type: DEFAULT_COLUMN_TYPE };
  const ops = [];
  let firstNewCellId = null;

  for (const rowId of table.contentIds) {
    const cell = createCellForColumn(rowId, newColumn);
    if (firstNewCellId === null) firstNewCellId = cell.block.id;
    ops.push(insertBlock(cell.block, rowId, colIndex + 1, { blocks: [cell.block], runs: [cell.run] }));
  }

  const nextColumns = [...currentColumns];
  nextColumns.splice(colIndex + 1, 0, newColumn);
  ops.push(updateBlockProps(tableId, { columns: nextColumns }));

  applyOps(store, ops);
  if (firstNewCellId) focusBlockStart(store, firstNewCellId);
  return firstNewCellId;
}

/**
 * Removes the cell at `colIndex` from every row. If it's the table's only
 * column, removes the whole table instead (same convention as deleteRow).
 * Otherwise focuses the cell now in the same column slot of the first row.
 * One atomic undo step, including the removed column's metadata.
 */
export function deleteColumn(store, tableId, colIndex) {
  const table = store.getBlock(tableId);
  const firstRow = store.getBlock(table.contentIds[0]);

  if (!firstRow || firstRow.contentIds.length <= 1) {
    return removeTableAndFocusSibling(store, table);
  }

  const currentColumns = resolveColumns(table, firstRow.contentIds.length);
  const ops = table.contentIds.map((rowId) => {
    const row = store.getBlock(rowId);
    return removeBlock(row.contentIds[colIndex]);
  });
  const nextColumns = currentColumns.filter((_, i) => i !== colIndex);
  ops.push(updateBlockProps(tableId, { columns: nextColumns }));
  applyOps(store, ops);

  const updatedFirstRow = store.getBlock(table.contentIds[0]);
  const targetColIndex = Math.min(colIndex, updatedFirstRow.contentIds.length - 1);
  const targetCellId = updatedFirstRow.contentIds[targetColIndex];
  if (targetCellId) focusBlockStart(store, targetCellId);
  return targetCellId ?? null;
}

/** Renames the column at `colIndex` — one atomic undo step. */
export function renameColumn(store, tableId, colIndex, label) {
  const table = store.getBlock(tableId);
  const firstRow = store.getBlock(table.contentIds[0]);
  const currentColumns = resolveColumns(table, firstRow ? firstRow.contentIds.length : 0);
  const nextColumns = [...currentColumns];
  if (!nextColumns[colIndex]) return;
  nextColumns[colIndex] = { ...nextColumns[colIndex], label };
  store.applyOperation(updateBlockProps(tableId, { columns: nextColumns }));
}

function cellRunsForColumn(store, table, colIndex) {
  return table.contentIds.map((rowId) => {
    const row = store.getBlock(rowId);
    const cellId = row.contentIds[colIndex];
    const cell = store.getBlock(cellId);
    return { cellId, run: store.getRun(cell.contentIds[0]) };
  });
}

function runPlainText(run, inlineRegistry) {
  if (!run) return '';
  if (run.type === 'text') return run.value ?? '';
  const entry = inlineRegistry?.get(run.type);
  return entry?.toPlainText ? entry.toPlainText(run) : '';
}

/**
 * Changing a column *to* select needs every cell's current value at once
 * (to build one shared, deduplicated option list — Notion's own "text ->
 * select" convention: one tag per distinct existing string, not one per
 * cell), which is why it's split out from the generic per-run
 * convertRunToType. Each cell is assigned whichever option matches its own
 * former text (blank cells stay unselected).
 */
function buildSelectColumnConversion(store, table, colIndex, inlineRegistry) {
  const cellRuns = cellRunsForColumn(store, table, colIndex);
  const options = [];
  const optionByLabel = new Map();

  for (const { run } of cellRuns) {
    const text = runPlainText(run, inlineRegistry).trim();
    if (!text || optionByLabel.has(text)) continue;
    const option = { value: genId(), label: text };
    optionByLabel.set(text, option);
    options.push(option);
  }

  const newRuns = cellRuns.map(({ cellId, run }) => {
    const text = runPlainText(run, inlineRegistry).trim();
    const option = optionByLabel.get(text);
    return { cellId, run: { id: genId(), type: 'tableSelect', value: '', marks: {}, data: { selectedValue: option?.value ?? '', selectedLabel: option?.label ?? '' } } };
  });

  return { options, newRuns };
}

/**
 * Changes the column at `colIndex` to `newType`, converting every existing
 * cell's run in that column instead of discarding their data (unlike the
 * legacy notevo table this was modeled after, which silently wiped a
 * column's values on any type change). `inlineRegistry` is needed to read
 * a non-text run's plain-text value when converting *away* from an atomic
 * type (date/checkbox/select) — pass the one from `useInlineRegistry()`.
 * One atomic undo step for the whole column, metadata and every cell
 * together.
 */
export function setColumnType(store, tableId, colIndex, newType, inlineRegistry) {
  const table = store.getBlock(tableId);
  const firstRow = store.getBlock(table.contentIds[0]);
  const currentColumns = resolveColumns(table, firstRow ? firstRow.contentIds.length : 0);
  const column = currentColumns[colIndex];
  if (!column || column.type === newType) return;

  const nextColumns = [...currentColumns];

  if (newType === 'select') {
    const { options, newRuns } = buildSelectColumnConversion(store, table, colIndex, inlineRegistry);
    nextColumns[colIndex] = { ...column, type: newType, options };
    const ops = [updateBlockProps(tableId, { columns: nextColumns })];
    for (const { cellId, run } of newRuns) ops.push(setBlockRuns(cellId, [run]));
    applyOps(store, ops);
    return;
  }

  nextColumns[colIndex] = { ...column, type: newType };
  const ops = [updateBlockProps(tableId, { columns: nextColumns })];
  for (const { cellId, run: oldRun } of cellRunsForColumn(store, table, colIndex)) {
    if (!oldRun) continue;
    const newRun = convertRunToType(oldRun, newType, inlineRegistry);
    ops.push(setBlockRuns(cellId, [newRun]));
  }
  applyOps(store, ops);
}

/**
 * Replaces a "select" column's shared option list — the header menu's
 * add/rename/remove-option UI, acting on the whole column at once (unlike
 * the general inline `select` type's per-cell add/remove buttons). Any
 * cell whose `selectedValue` no longer matches a surviving option (i.e.
 * that option was removed) is cleared back to unselected rather than left
 * pointing at a dangling id; a cell whose option was only *renamed* keeps
 * its selection and just picks up the new label. One atomic undo step.
 */
export function setColumnOptions(store, tableId, colIndex, options) {
  const table = store.getBlock(tableId);
  const firstRow = store.getBlock(table.contentIds[0]);
  const currentColumns = resolveColumns(table, firstRow ? firstRow.contentIds.length : 0);
  const column = currentColumns[colIndex];
  if (!column) return;

  const nextColumns = [...currentColumns];
  nextColumns[colIndex] = { ...column, options };
  const ops = [updateBlockProps(tableId, { columns: nextColumns })];

  const optionById = new Map(options.map((o) => [o.value, o]));
  for (const { run } of cellRunsForColumn(store, table, colIndex)) {
    if (!run || run.type !== 'tableSelect') continue;
    const selectedValue = run.data?.selectedValue ?? '';
    const match = optionById.get(selectedValue);
    const nextSelectedValue = match ? selectedValue : '';
    const nextSelectedLabel = match ? match.label : '';
    if (nextSelectedValue !== selectedValue || nextSelectedLabel !== (run.data?.selectedLabel ?? '')) {
      ops.push(updateRun(run.id, { data: { selectedValue: nextSelectedValue, selectedLabel: nextSelectedLabel } }));
    }
  }

  applyOps(store, ops);
}
