import { genId } from '../../utils/idGen.js';
import { createDefaultColumns, createCellForColumn } from './tableColumns.js';

function createRow(parentId, columns) {
  const rowId = genId();
  const cellBlocks = [];
  const runs = [];
  const contentIds = [];
  for (const column of columns) {
    const cell = createCellForColumn(rowId, column);
    cellBlocks.push(cell.block);
    runs.push(cell.run);
    contentIds.push(cell.block.id);
  }
  return { block: { id: rowId, type: 'tableRow', parentId, contentIds, props: {} }, blocks: cellBlocks, runs };
}

/** factory(parentId) -> {block, runs, subtreeBlocks} for a fresh rows x cols table. */
export function createTableBlock({ rows = 2, cols = 2 } = {}) {
  return function factory(parentId) {
    const tableId = genId();
    const columns = createDefaultColumns(cols);
    const subtreeBlocks = [];
    const allRuns = [];
    const rowIds = [];

    for (let r = 0; r < rows; r += 1) {
      const row = createRow(tableId, columns);
      subtreeBlocks.push(row.block, ...row.blocks);
      allRuns.push(...row.runs);
      rowIds.push(row.block.id);
    }

    const block = { id: tableId, type: 'table', parentId, contentIds: rowIds, props: { columns } };
    return { block, runs: allRuns, subtreeBlocks };
  };
}
