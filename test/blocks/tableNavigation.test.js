import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { resolveAdjacentCellTarget, moveToAdjacentCell } from '../../src/blocks/table/tableNavigation.js';
import { createTableBlock } from '../../src/blocks/table/createTableBlock.js';
import { insertBlock } from '../../src/store/operations.js';

function makeDoc() {
  const store = new EditorStore({
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  });
  const { block, runs = [], subtreeBlocks = [] } = createTableBlock({ rows: 2, cols: 2 })('root');
  store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));
  return { store, tableId: block.id };
}

function cellAt(store, tableId, rowIndex, colIndex) {
  const rowId = store.getBlock(tableId).contentIds[rowIndex];
  return store.getBlock(rowId).contentIds[colIndex];
}

describe('resolveAdjacentCellTarget', () => {
  it('moves right within a row', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 0, 0);
    expect(resolveAdjacentCellTarget(store, from, 'right')).toBe(cellAt(store, tableId, 0, 1));
  });

  it('moves left within a row', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 0, 1);
    expect(resolveAdjacentCellTarget(store, from, 'left')).toBe(cellAt(store, tableId, 0, 0));
  });

  it('wraps right at end of row to the first cell of the next row', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 0, 1); // last cell of row 0
    expect(resolveAdjacentCellTarget(store, from, 'right')).toBe(cellAt(store, tableId, 1, 0));
  });

  it('wraps left at start of row to the last cell of the previous row', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 1, 0); // first cell of row 1
    expect(resolveAdjacentCellTarget(store, from, 'left')).toBe(cellAt(store, tableId, 0, 1));
  });

  it('Tab (right) at the very last cell resolves to null (exiting the table is handled by moveToAdjacentCell, not this pure resolver)', () => {
    const { store, tableId } = makeDoc();
    const lastCell = cellAt(store, tableId, 1, 1); // bottom-right cell of a 2x2 table
    expect(resolveAdjacentCellTarget(store, lastCell, 'right')).toBeNull();
    expect(store.getBlock(tableId).contentIds.length).toBe(2); // no row appended — no longer this function's side effect
  });

  it('moves down within a column', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 0, 1);
    expect(resolveAdjacentCellTarget(store, from, 'down')).toBe(cellAt(store, tableId, 1, 1));
  });

  it('moves up within a column', () => {
    const { store, tableId } = makeDoc();
    const from = cellAt(store, tableId, 1, 0);
    expect(resolveAdjacentCellTarget(store, from, 'up')).toBe(cellAt(store, tableId, 0, 0));
  });

  it('returns null at the top/bottom edge instead of wrapping', () => {
    const { store, tableId } = makeDoc();
    expect(resolveAdjacentCellTarget(store, cellAt(store, tableId, 0, 0), 'up')).toBeNull();
    expect(resolveAdjacentCellTarget(store, cellAt(store, tableId, 1, 0), 'down')).toBeNull();
  });
});

describe('moveToAdjacentCell: Tab past the last cell exits the table', () => {
  it('does not append a row when Tab is pressed at the last cell', () => {
    const { store, tableId } = makeDoc();
    const lastCell = cellAt(store, tableId, 1, 1);

    moveToAdjacentCell(store, lastCell, 'right');

    expect(store.getBlock(tableId).contentIds.length).toBe(2); // unchanged
  });

  it('when a block already follows the table, exiting does not create a new one', () => {
    const { store, tableId } = makeDoc();
    const followingParagraph = { id: 'p-after', type: 'paragraph', parentId: 'root', contentIds: ['r-after'], props: {} };
    store.applyOperation(
      insertBlock(followingParagraph, 'root', 1, {
        blocks: [followingParagraph],
        runs: [{ id: 'r-after', type: 'text', value: 'after', marks: {} }],
      }),
    );
    const lastCell = cellAt(store, tableId, 1, 1);

    moveToAdjacentCell(store, lastCell, 'right');

    expect(store.getBlock('root').contentIds).toEqual([tableId, 'p-after']); // no extra block created
  });

  it('when the table is the last block, exiting creates a fresh blank paragraph after it', () => {
    const { store, tableId } = makeDoc();
    const lastCell = cellAt(store, tableId, 1, 1);

    moveToAdjacentCell(store, lastCell, 'right');

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(rootIds[0]).toBe(tableId);
    const newBlock = store.getBlock(rootIds[1]);
    expect(newBlock.type).toBe('paragraph');
    expect(store.getRun(newBlock.contentIds[0]).value).toBe('');
  });
});
