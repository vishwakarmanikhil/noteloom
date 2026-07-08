import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { createTableBlock } from '../../src/blocks/table/createTableBlock.js';
import { insertBlock } from '../../src/store/operations.js';
import {
  insertRowAfter,
  deleteRow,
  insertColumnAfter,
  deleteColumn,
  renameColumn,
  setColumnType,
  setColumnOptions,
} from '../../src/blocks/table/tableEditCommands.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

function makeDocWithTable({ rows = 2, cols = 2 } = {}) {
  const store = new EditorStore({
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  });
  const { block, runs = [], subtreeBlocks = [] } = createTableBlock({ rows, cols })('root');
  store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));
  return { store, tableId: block.id };
}

function cellAt(store, tableId, rowIndex, colIndex) {
  const rowId = store.getBlock(tableId).contentIds[rowIndex];
  return store.getBlock(rowId).contentIds[colIndex];
}

describe('insertRowAfter', () => {
  it('inserts a new row with the same column count right after the given row', () => {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 3 });
    const row0 = store.getBlock(tableId).contentIds[0];

    const newRowId = insertRowAfter(store, row0);

    const contentIds = store.getBlock(tableId).contentIds;
    expect(contentIds.length).toBe(3);
    expect(contentIds[1]).toBe(newRowId);
    expect(store.getBlock(newRowId).contentIds.length).toBe(3); // same col count
    for (const cellId of store.getBlock(newRowId).contentIds) {
      expect(store.getBlock(cellId).type).toBe('tableCell');
    }
  });
});

describe('deleteRow', () => {
  it('removes a row when the table has more than one', () => {
    const { store, tableId } = makeDocWithTable({ rows: 3, cols: 2 });
    const rowIds = store.getBlock(tableId).contentIds;
    const middleRowId = rowIds[1];

    deleteRow(store, middleRowId);

    expect(store.getBlock(tableId).contentIds.length).toBe(2);
    expect(store.getBlock(middleRowId)).toBeUndefined();
    expect(store.getBlock(tableId).contentIds).not.toContain(middleRowId);
  });

  it('removes the whole table when deleting its only row, falling back to an empty paragraph since it was the only block', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 2 });
    const rowId = store.getBlock(tableId).contentIds[0];

    deleteRow(store, rowId);

    expect(store.getBlock(tableId)).toBeUndefined();
    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1);
    expect(store.getBlock(rootContentIds[0]).type).toBe('paragraph');
  });

  it('deleting cells and runs are cleaned up too (no orphaned data)', () => {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 2 });
    const rowId = store.getBlock(tableId).contentIds[0];
    const cellIds = store.getBlock(rowId).contentIds;
    const runIds = cellIds.map((id) => store.getBlock(id).contentIds[0]);

    deleteRow(store, rowId);

    for (const cellId of cellIds) expect(store.getBlock(cellId)).toBeUndefined();
    for (const runId of runIds) expect(store.getRun(runId)).toBeUndefined();
  });
});

describe('insertColumnAfter', () => {
  it('inserts a new cell in every row at colIndex + 1', () => {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 2 });

    insertColumnAfter(store, tableId, 0);

    const rowIds = store.getBlock(tableId).contentIds;
    for (const rowId of rowIds) {
      const row = store.getBlock(rowId);
      expect(row.contentIds.length).toBe(3);
      expect(store.getBlock(row.contentIds[1]).type).toBe('tableCell'); // the new cell, between old col 0 and col 1
    }
  });
});

describe('deleteColumn', () => {
  it('removes the cell at colIndex from every row', () => {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 3 });
    const removedCellIds = store.getBlock(tableId).contentIds.map((rowId) => cellAt(store, tableId, store.getBlock(tableId).contentIds.indexOf(rowId), 1));

    deleteColumn(store, tableId, 1);

    const rowIds = store.getBlock(tableId).contentIds;
    for (const rowId of rowIds) {
      expect(store.getBlock(rowId).contentIds.length).toBe(2);
    }
    for (const cellId of removedCellIds) expect(store.getBlock(cellId)).toBeUndefined();
  });

  it('removes the whole table when deleting its only column, falling back to an empty paragraph since it was the only block', () => {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 1 });

    deleteColumn(store, tableId, 0);

    expect(store.getBlock(tableId)).toBeUndefined();
    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1);
    expect(store.getBlock(rootContentIds[0]).type).toBe('paragraph');
  });
});

describe('column metadata (props.columns)', () => {
  it('createTableBlock seeds default labels ("Column 1", "Column 2", ...)', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 3 });
    const columns = store.getBlock(tableId).props.columns;
    expect(columns.map((c) => c.label)).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(new Set(columns.map((c) => c.id)).size).toBe(3); // stable, distinct ids
  });

  it('renameColumn updates just that column\'s label, one atomic undo step', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const store = new History(rawStore);
    const { block, runs, subtreeBlocks } = createTableBlock({ rows: 1, cols: 2 })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));

    renameColumn(store, block.id, 1, 'Diagnosis');

    const columns = store.getBlock(block.id).props.columns;
    expect(columns[0].label).toBe('Column 1'); // untouched
    expect(columns[1].label).toBe('Diagnosis');

    store.undo();
    expect(store.getBlock(block.id).props.columns[1].label).toBe('Column 2');
  });

  it('insertColumnAfter inserts a matching column entry at the right position', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 2 });
    renameColumn(store, tableId, 0, 'First');
    renameColumn(store, tableId, 1, 'Second');

    insertColumnAfter(store, tableId, 0); // between First and Second

    const columns = store.getBlock(tableId).props.columns;
    expect(columns.map((c) => c.label)).toEqual(['First', 'New Column', 'Second']);
  });

  it('deleteColumn removes the matching column entry, keeping the rest aligned', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 3 });
    renameColumn(store, tableId, 0, 'First');
    renameColumn(store, tableId, 1, 'Second');
    renameColumn(store, tableId, 2, 'Third');

    deleteColumn(store, tableId, 1);

    const columns = store.getBlock(tableId).props.columns;
    expect(columns.map((c) => c.label)).toEqual(['First', 'Third']);
  });

  it('insertColumnAfter and its column-metadata update are one atomic undo step', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const store = new History(rawStore);
    const { block, runs, subtreeBlocks } = createTableBlock({ rows: 1, cols: 2 })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));

    insertColumnAfter(store, block.id, 0);
    expect(store.getBlock(block.id).props.columns.length).toBe(3);
    expect(store.getBlock(block.id).contentIds.map((rowId) => store.getBlock(rowId).contentIds.length)).toEqual([3]);

    store.undo(); // must undo the new cell AND the column-metadata update together
    expect(store.getBlock(block.id).props.columns.length).toBe(2);
    expect(store.getBlock(block.id).contentIds.map((rowId) => store.getBlock(rowId).contentIds.length)).toEqual([2]);
  });
});

describe('typed columns (props.columns[i].type + setColumnType)', () => {
  it('createTableBlock seeds every column as type "text" by default', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 2 });
    expect(store.getBlock(tableId).props.columns.map((c) => c.type)).toEqual(['text', 'text']);
  });

  it('converts a text column to date, parsing existing cell text where possible', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    const cellId = store.getBlock(store.getBlock(tableId).contentIds[0]).contentIds[0];
    const runId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: runId, patch: { value: '2026-03-15' } });

    setColumnType(store, tableId, 0, 'date', makeInlineRegistry());

    expect(store.getBlock(tableId).props.columns[0].type).toBe('date');
    const newRunId = store.getBlock(cellId).contentIds[0];
    const newRun = store.getRun(newRunId);
    expect(newRun.type).toBe('date');
    expect(newRun.data.isoDate).toBe('2026-03-15');
  });

  it('converts a text column to checkbox, preserving the text as the label (unchecked by default — not silently wiped)', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    const rowId = store.getBlock(tableId).contentIds[0];
    const cellId = store.getBlock(rowId).contentIds[0];
    const runId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: runId, patch: { value: 'Follow up needed' } });

    setColumnType(store, tableId, 0, 'checkbox', makeInlineRegistry());

    const newRun = store.getRun(store.getBlock(cellId).contentIds[0]);
    expect(newRun.type).toBe('checkbox');
    expect(newRun.data).toEqual({ checked: false, label: 'Follow up needed' });
  });

  it('converts a text column to select, seeding one shared column option from the existing text and selecting it', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    const rowId = store.getBlock(tableId).contentIds[0];
    const cellId = store.getBlock(rowId).contentIds[0];
    const runId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: runId, patch: { value: 'Flu' } });

    setColumnType(store, tableId, 0, 'select', makeInlineRegistry());

    // options live on the column (shared across every cell), not per-run
    const column = store.getBlock(tableId).props.columns[0];
    expect(column.type).toBe('select');
    expect(column.options.map((o) => o.label)).toEqual(['Flu']);

    const newRun = store.getRun(store.getBlock(cellId).contentIds[0]);
    expect(newRun.type).toBe('tableSelect');
    expect(newRun.data.selectedValue).toBe(column.options[0].value);
    expect(newRun.data.selectedLabel).toBe('Flu');
  });

  it('converting a text column with duplicate values to select creates one option per distinct value, not one per cell', () => {
    const { store, tableId } = makeDocWithTable({ rows: 3, cols: 1 });
    const rowIds = store.getBlock(tableId).contentIds;
    const values = ['Flu', 'Cold', 'Flu'];
    rowIds.forEach((rowId, i) => {
      const cellId = store.getBlock(rowId).contentIds[0];
      const runId = store.getBlock(cellId).contentIds[0];
      store.applyOperation({ type: 'updateRun', id: runId, patch: { value: values[i] } });
    });

    setColumnType(store, tableId, 0, 'select', makeInlineRegistry());

    const column = store.getBlock(tableId).props.columns[0];
    expect(column.options.map((o) => o.label)).toEqual(['Flu', 'Cold']); // deduplicated

    const selectedLabels = rowIds.map((rowId) => {
      const cellId = store.getBlock(rowId).contentIds[0];
      return store.getRun(store.getBlock(cellId).contentIds[0]).data.selectedLabel;
    });
    expect(selectedLabels).toEqual(['Flu', 'Cold', 'Flu']); // both "Flu" cells share the same option
  });

  it('converts an atomic (date) column back to text using the inline type\'s own toPlainText', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    const inlineRegistry = makeInlineRegistry();
    setColumnType(store, tableId, 0, 'date', inlineRegistry);

    const rowId = store.getBlock(tableId).contentIds[0];
    const cellId = store.getBlock(rowId).contentIds[0];
    const dateRunId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: dateRunId, patch: { data: { isoDate: '2026-01-01' } } });

    setColumnType(store, tableId, 0, 'text', inlineRegistry);

    const newRun = store.getRun(store.getBlock(cellId).contentIds[0]);
    expect(newRun.type).toBe('text');
    expect(newRun.value.length).toBeGreaterThan(0); // formatted date string, not blank
  });

  it('setting the same type again is a no-op', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    const before = store.getBlock(tableId).props.columns[0];
    setColumnType(store, tableId, 0, 'text', makeInlineRegistry());
    expect(store.getBlock(tableId).props.columns[0]).toEqual(before);
  });

  it('converts every row in the column together, as one atomic undo step', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const store = new History(rawStore);
    const { block, runs, subtreeBlocks } = createTableBlock({ rows: 3, cols: 1 })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));

    setColumnType(store, block.id, 0, 'checkbox', makeInlineRegistry());

    const cellRunTypes = () =>
      store.getBlock(block.id).contentIds.map((rowId) => {
        const cellId = store.getBlock(rowId).contentIds[0];
        return store.getRun(store.getBlock(cellId).contentIds[0]).type;
      });
    expect(cellRunTypes()).toEqual(['checkbox', 'checkbox', 'checkbox']);

    store.undo(); // must revert the column metadata AND all three cells together
    expect(store.getBlock(block.id).props.columns[0].type).toBe('text');
    expect(cellRunTypes()).toEqual(['text', 'text', 'text']);
  });

  it('insertRowAfter on a table with a non-text column gives the new row a matching-typed cell', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 2 });
    setColumnType(store, tableId, 1, 'checkbox', makeInlineRegistry());

    const firstRowId = store.getBlock(tableId).contentIds[0];
    insertRowAfter(store, firstRowId);

    const newRowId = store.getBlock(tableId).contentIds[1];
    const newCellId = store.getBlock(newRowId).contentIds[1];
    const newRun = store.getRun(store.getBlock(newCellId).contentIds[0]);
    expect(newRun.type).toBe('checkbox'); // matches column 1's type, not a stray text cell
    expect(newRun.data).toEqual({ checked: false, label: '' });
  });

  it('insertRowAfter on a select column gives the new row an unselected tableSelect cell (no options of its own — reads the shared column list)', () => {
    const { store, tableId } = makeDocWithTable({ rows: 1, cols: 1 });
    setColumnType(store, tableId, 0, 'select', makeInlineRegistry());
    setColumnOptions(store, tableId, 0, [{ value: 'opt1', label: 'Open' }]);

    const firstRowId = store.getBlock(tableId).contentIds[0];
    insertRowAfter(store, firstRowId);

    const newRowId = store.getBlock(tableId).contentIds[1];
    const newCellId = store.getBlock(newRowId).contentIds[0];
    const newRun = store.getRun(store.getBlock(newCellId).contentIds[0]);
    expect(newRun.type).toBe('tableSelect');
    expect(newRun.data).toEqual({ selectedValue: '', selectedLabel: '' });
  });
});

describe('setColumnOptions (select column shared option list)', () => {
  function makeSelectColumnDoc() {
    const { store, tableId } = makeDocWithTable({ rows: 2, cols: 1 });
    const rowIds = store.getBlock(tableId).contentIds;
    store.applyOperation({ type: 'updateRun', id: store.getBlock(store.getBlock(rowIds[0]).contentIds[0]).contentIds[0], patch: { value: 'a' } });
    setColumnType(store, tableId, 0, 'select', makeInlineRegistry());
    return { store, tableId, rowIds };
  }

  it('adding an option makes it available without touching existing cell selections', () => {
    const { store, tableId, rowIds } = makeSelectColumnDoc();
    const before = store.getBlock(tableId).props.columns[0].options;

    setColumnOptions(store, tableId, 0, [...before, { value: 'new-opt', label: 'Pending' }]);

    const column = store.getBlock(tableId).props.columns[0];
    expect(column.options.map((o) => o.label)).toEqual(['a', 'Pending']);
    const firstCellId = store.getBlock(rowIds[0]).contentIds[0];
    expect(store.getRun(store.getBlock(firstCellId).contentIds[0]).data.selectedLabel).toBe('a'); // untouched
  });

  it('removing an option clears any cell that had it selected', () => {
    const { store, tableId, rowIds } = makeSelectColumnDoc();
    const firstCellId = store.getBlock(rowIds[0]).contentIds[0];
    const selectedOptionValue = store.getRun(store.getBlock(firstCellId).contentIds[0]).data.selectedValue;

    setColumnOptions(store, tableId, 0, []); // remove all options, including the selected one

    expect(store.getBlock(tableId).props.columns[0].options).toEqual([]);
    const run = store.getRun(store.getBlock(firstCellId).contentIds[0]);
    expect(run.data).toEqual({ selectedValue: '', selectedLabel: '' });
    expect(selectedOptionValue).toBeTruthy(); // sanity: it really had been selected before
  });

  it('renaming an option keeps a cell\'s selection and updates its cached label', () => {
    const { store, tableId, rowIds } = makeSelectColumnDoc();
    const column = store.getBlock(tableId).props.columns[0];
    const optionValue = column.options[0].value;

    setColumnOptions(store, tableId, 0, [{ value: optionValue, label: 'Renamed' }]);

    const firstCellId = store.getBlock(rowIds[0]).contentIds[0];
    const run = store.getRun(store.getBlock(firstCellId).contentIds[0]);
    expect(run.data.selectedValue).toBe(optionValue); // selection preserved
    expect(run.data.selectedLabel).toBe('Renamed'); // cached label kept in sync
  });

  it('is one atomic undo step through History', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const store = new History(rawStore);
    const { block, runs, subtreeBlocks } = createTableBlock({ rows: 1, cols: 1 })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));
    setColumnType(store, block.id, 0, 'select', makeInlineRegistry());

    setColumnOptions(store, block.id, 0, [{ value: 'a', label: 'Alpha' }]);
    expect(store.getBlock(block.id).props.columns[0].options).toEqual([{ value: 'a', label: 'Alpha' }]);

    store.undo();
    expect(store.getBlock(block.id).props.columns[0].options).toEqual([]);
  });
});
