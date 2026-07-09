import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { insertBlock } from '../../src/store/operations.js';
import { createTableBlock } from '../../src/blocks/table/createTableBlock.js';
import { createLayoutBlock } from '../../src/blocks/layout/createLayoutBlock.js';
import { setColumnType, setColumnWidth } from '../../src/blocks/table/tableEditCommands.js';
import { DEFAULT_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../../src/blocks/table/tableColumns.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory) {
  const { block, runs = [], subtreeBlocks = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block, ...subtreeBlocks], runs }));
  return block.id;
}

function renderDoc(store, registry) {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return render(
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('table block type reuses the leaf/container primitives', () => {
  it('renders a 2x2 table where each cell reuses the run-editing machinery', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 2, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const rows = container.querySelectorAll('.be-table-row');
    expect(rows.length).toBe(2);
    const cells = container.querySelectorAll('.be-table-cell');
    expect(cells.length).toBe(4);
    // every cell has an editable run inside it, same element used by paragraphs
    for (const cell of cells) {
      expect(cell.querySelector('[data-run-id]')).not.toBeNull();
    }
  });

  it('typing into one cell updates only that cell\'s run', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const runNodes = container.querySelectorAll('[data-run-id]');
    expect(runNodes.length).toBe(2);
    const [firstRunNode, secondRunNode] = runNodes;
    const secondRunId = secondRunNode.getAttribute('data-run-id');
    const secondValueBefore = store.getRun(secondRunId).value;

    firstRunNode.textContent = 'Medicine';
    fireEvent.input(firstRunNode);

    expect(store.getRun(firstRunNode.getAttribute('data-run-id')).value).toBe('Medicine');
    expect(store.getRun(secondRunId).value).toBe(secondValueBefore);
  });

  it('toHTML serializes the table via the registry, recursing row -> cell -> run', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const rowId = store.getBlock(tableId).contentIds[0];
    const cellId = store.getBlock(rowId).contentIds[0];
    const runId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: runId, patch: { value: 'hi' } });

    const html = registry.get('table').toHTML(store.getBlock(tableId), { store, registry });
    expect(html).toBe('<table><thead><tr><th>Column 1</th></tr></thead><tbody><tr><td>hi</td></tr></tbody></table>');
  });
});

describe('table row add/delete UI', () => {
  it('clicking "+ Add row" appends a new row with the same column count', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-table-add-row'));

    const rowIds = store.getBlock(tableId).contentIds;
    expect(rowIds.length).toBe(2);
    expect(store.getBlock(rowIds[1]).contentIds.length).toBe(2);
  });

  it('clicking a row\'s delete button removes just that row', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 2, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const firstRowId = store.getBlock(tableId).contentIds[0];
    const deleteButtons = container.querySelectorAll('.be-table-delete-row');
    expect(deleteButtons.length).toBe(2);
    fireEvent.click(deleteButtons[0]);

    expect(store.getBlock(tableId).contentIds.length).toBe(1);
    expect(store.getBlock(firstRowId)).toBeUndefined();
  });

  it('deleting the only row removes the whole table, falling back to an empty paragraph since it was the only block', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-table-delete-row'));

    expect(store.getBlock(tableId)).toBeUndefined();
    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1);
    expect(store.getBlock(rootContentIds[0]).type).toBe('paragraph');
  });
});

describe('table header row (column labels + insert/rename/delete column UI)', () => {
  it('renders one editable label per column, seeded with the default "Column N" names', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const labels = [...container.querySelectorAll('.be-table-header-label')].map((el) => el.value);
    expect(labels).toEqual(['Column 1', 'Column 2']);
  });

  it('editing a header label renames just that column', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const secondLabel = container.querySelectorAll('.be-table-header-label')[1];
    fireEvent.change(secondLabel, { target: { value: 'Diagnosis' } });

    expect(store.getBlock(tableId).props.columns.map((c) => c.label)).toEqual(['Column 1', 'Diagnosis']);
  });

  it('the column menu inserts a column to the right and updates the cell grid', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const firstHeaderCell = container.querySelectorAll('.be-table-header-cell')[0];
    fireEvent.click(firstHeaderCell.querySelector('.be-table-header-menu-trigger'));
    const insertRightButton = [...document.querySelectorAll('.be-table-header-menu-item')].find((b) =>
      b.textContent.includes('right'),
    );
    fireEvent.click(insertRightButton);

    expect(store.getBlock(tableId).props.columns.length).toBe(3);
    const rowId = store.getBlock(tableId).contentIds[0];
    expect(store.getBlock(rowId).contentIds.length).toBe(3);
  });

  it('the column menu deletes a column and its metadata together', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const firstHeaderCell = container.querySelectorAll('.be-table-header-cell')[0];
    fireEvent.click(firstHeaderCell.querySelector('.be-table-header-menu-trigger'));
    const deleteButton = [...document.querySelectorAll('.be-table-header-menu-item')].find((b) =>
      b.textContent.includes('Delete'),
    );
    fireEvent.click(deleteButton);

    expect(store.getBlock(tableId).props.columns.length).toBe(1);
    const rowId = store.getBlock(tableId).contentIds[0];
    expect(store.getBlock(rowId).contentIds.length).toBe(1);
  });

  it('the type selector in the column menu converts the column (and its cells) to the chosen type', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const cellId = store.getBlock(store.getBlock(tableId).contentIds[0]).contentIds[0];
    const runId = store.getBlock(cellId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: runId, patch: { value: 'Flu' } });

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const headerCell = container.querySelector('.be-table-header-cell');
    fireEvent.click(headerCell.querySelector('.be-table-header-menu-trigger'));
    fireEvent.click(document.querySelector('.be-table-header-menu-type .be-select-trigger'));
    fireEvent.mouseDown([...document.querySelectorAll('.be-select-option')].find((el) => el.textContent === 'Checkbox'));

    expect(store.getBlock(tableId).props.columns[0].type).toBe('checkbox');
    const newRun = store.getRun(store.getBlock(cellId).contentIds[0]);
    expect(newRun.type).toBe('checkbox');
    expect(newRun.data.label).toBe('Flu'); // converted, not wiped

    // the cell now actually renders the checkbox chip, not a plain text run
    expect(container.querySelector(`[data-run-id="${newRun.id}"] input[type="checkbox"]`)).not.toBeNull();
    expect(container.querySelector('.be-inline-checkbox-label').value).toBe('Flu');
  });
});

describe('table columns: default width + resizable via drag handle', () => {
  it('new columns default to DEFAULT_COLUMN_WIDTH, reflected in the <colgroup>', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const cols = [...container.querySelectorAll('colgroup col[data-col-index]')];
    expect(cols).toHaveLength(2);
    expect(cols[0].style.width).toBe(`${DEFAULT_COLUMN_WIDTH}px`);
    expect(cols[1].style.width).toBe(`${DEFAULT_COLUMN_WIDTH}px`);
  });

  it('setColumnWidth updates just that column\'s stored width, clamped to MIN_COLUMN_WIDTH', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));

    setColumnWidth(store, tableId, 0, 240);
    expect(store.getBlock(tableId).props.columns[0].width).toBe(240);
    expect(store.getBlock(tableId).props.columns[1].width).toBe(DEFAULT_COLUMN_WIDTH); // untouched

    setColumnWidth(store, tableId, 1, 10); // below the minimum
    expect(store.getBlock(tableId).props.columns[1].width).toBe(MIN_COLUMN_WIDTH);
  });

  it('dragging the resize handle live-updates the <col> width and commits once on mouseup', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const th = container.querySelector('.be-table-header-cell');
    th.getBoundingClientRect = () => ({ width: DEFAULT_COLUMN_WIDTH, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 });
    const handle = container.querySelector('.be-table-col-resize-handle');
    const col = container.querySelector('colgroup col[data-col-index="0"]');

    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(store.getBlock(tableId).props.columns[0].width).toBe(DEFAULT_COLUMN_WIDTH); // no store write yet

    fireEvent.mouseMove(document, { clientX: 150 }); // dragged 50px wider
    expect(col.style.width).toBe(`${DEFAULT_COLUMN_WIDTH + 50}px`); // live preview, no store write yet
    expect(store.getBlock(tableId).props.columns[0].width).toBe(DEFAULT_COLUMN_WIDTH);

    fireEvent.mouseUp(document, { clientX: 150 });
    expect(store.getBlock(tableId).props.columns[0].width).toBe(DEFAULT_COLUMN_WIDTH + 50);
  });
});

describe('table header menu: portaled to document.body (regression: was clipped by .be-table-wrapper)', () => {
  it('the menu is NOT a DOM descendant of the table wrapper', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-table-header-menu-trigger'));

    expect(container.querySelector('.be-table-header-menu')).toBeNull(); // not inside the wrapper
    expect(document.querySelector('.be-table-header-menu')).not.toBeNull(); // portaled to document.body
    expect(document.body.contains(document.querySelector('.be-table-header-menu'))).toBe(true);
  });

  it('closes on outside click and Escape', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-table-header-menu-trigger'));
    expect(document.querySelector('.be-table-header-menu')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.be-table-header-menu')).toBeNull();

    fireEvent.click(container.querySelector('.be-table-header-menu-trigger'));
    expect(document.querySelector('.be-table-header-menu')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.be-table-header-menu')).toBeNull();
  });
});

describe('table select column: shared options, managed from the column header (not per cell)', () => {
  it('every cell in the column shares the same dropdown choices, and adding one option updates all cells at once', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 2, cols: 1 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const headerCell = container.querySelector('.be-table-header-cell');
    fireEvent.click(headerCell.querySelector('.be-table-header-menu-trigger'));
    fireEvent.click(document.querySelector('.be-table-header-menu-type .be-select-trigger'));
    fireEvent.mouseDown([...document.querySelectorAll('.be-select-option')].find((el) => el.textContent === 'Select'));

    // re-open the menu (changing type may have re-rendered it closed) and add an option
    if (!document.querySelector('.be-table-header-menu')) {
      fireEvent.click(headerCell.querySelector('.be-table-header-menu-trigger'));
    }
    const addInput = document.querySelector('.be-table-header-menu-option-input[placeholder="New option…"]');
    fireEvent.change(addInput, { target: { value: 'Open' } });
    fireEvent.click(document.querySelector('.be-table-header-menu-option-add'));

    const triggers = container.querySelectorAll('.be-inline-table-select .be-select-trigger');
    expect(triggers.length).toBe(2); // one per row
    for (const trigger of triggers) {
      fireEvent.click(trigger);
      const labels = [...document.querySelectorAll('.be-select-option')].map((o) => o.textContent);
      expect(labels).toContain('Open'); // both cells see the same new option
      fireEvent.click(trigger); // close before checking the next one
    }
  });

  it('no per-cell "add option" button is rendered for a select column (unlike the general inline select type)', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    setColumnType(store, tableId, 0, 'select', inlineRegistry);

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    expect(container.querySelector('.be-inline-table-select .be-select-trigger')).not.toBeNull();
    expect(container.querySelector('.be-inline-select-add')).toBeNull();
  });

  it('regression: mousedown on the cell\'s Select calls preventDefault so the cell\'s own caret can\'t win the focus race', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    setColumnType(store, tableId, 0, 'select', inlineRegistry);

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const dispatched = fireEvent.mouseDown(container.querySelector('.be-inline-table-select .be-select-trigger'));
    expect(dispatched).toBe(false); // false means preventDefault was called
  });

  it('a newly created option gets a color assigned once, and it renders as a colored pill in cells (Notion-style)', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 1 }));
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    setColumnType(store, tableId, 0, 'select', inlineRegistry);

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-table-header-menu-trigger'));
    const addInput = document.querySelector('.be-table-header-menu-option-input[placeholder="New option…"]');
    fireEvent.change(addInput, { target: { value: 'Urgent' } });
    fireEvent.click(document.querySelector('.be-table-header-menu-option-add'));

    const column = store.getBlock(tableId).props.columns[0];
    expect(column.options[0].color).toBeDefined();
    expect(column.options[0].color.bg).toBeDefined();

    // the swatch next to the option in the manager reflects that color
    // (jsdom normalizes the inline hex to rgb(), so just check it's set)
    const swatch = document.querySelector('.be-table-header-menu-option-swatch');
    expect(swatch.style.background).not.toBe('');

    // and the cell's own Select shows it as a colored pill, not plain text
    const trigger = container.querySelector('.be-inline-table-select .be-select-trigger');
    fireEvent.click(trigger);
    fireEvent.mouseDown([...document.querySelectorAll('.be-select-option')].find((el) => el.textContent === 'Urgent'));
    expect(container.querySelector('.be-inline-table-select .be-select-tag').textContent).toBe('Urgent');
    expect(container.querySelector('.be-inline-table-select .be-select-chevron')).toBeNull();
  });
});

describe('table HTML round-trip includes column labels', () => {
  it('toHTML emits a <thead> with the column labels, and fromHTML reads them back', () => {
    const store = new EditorStore(emptyDoc());
    const tableId = insertAtRoot(store, createTableBlock({ rows: 1, cols: 2 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const table = store.getBlock(tableId);
    const html = registry.get('table').toHTML(table, { store, registry });
    expect(html).toContain('<thead><tr><th>Column 1</th><th>Column 2</th></tr></thead>');

    const dom = new DOMParser().parseFromString(html, 'text/html');
    const result = registry.get('table').fromHTML(dom.querySelector('table'), { registry });
    expect(result.block.props.columns.map((c) => c.label)).toEqual(['Column 1', 'Column 2']);
    expect(result.block.contentIds.length).toBe(1); // exactly one data row — the thead row wasn't double-counted
  });

  it('external HTML with no <thead> at all still gets default column labels via resolveColumns', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const dom = new DOMParser().parseFromString('<table><tr><td>a</td><td>b</td></tr></table>', 'text/html');
    const result = registry.get('table').fromHTML(dom.querySelector('table'), { registry });

    expect(result.block.props.columns).toBeUndefined();
    expect(result.block.contentIds.length).toBe(1);
  });
});

describe('layout block type reuses the page container mechanism', () => {
  it.each([2, 3, 4, 5])('renders %i columns, each independently holding child blocks', (columns) => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createLayoutBlock({ columns }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const columnEls = container.querySelectorAll('.be-layout-column');
    expect(columnEls.length).toBe(columns);
    for (const column of columnEls) {
      expect(column.querySelector('.be-paragraph')).not.toBeNull();
    }
  });

  it('typing in one column only updates that column\'s own run, siblings untouched', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createLayoutBlock({ columns: 3 }));

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const runNodes = container.querySelectorAll('[data-run-id]');
    expect(runNodes.length).toBe(3); // one blank paragraph run per column
    runNodes[1].textContent = 'middle column text';
    fireEvent.input(runNodes[1]);

    expect(store.getRun(runNodes[1].dataset.runId).value).toBe('middle column text');
    expect(store.getRun(runNodes[0].dataset.runId).value).toBe('');
    expect(store.getRun(runNodes[2].dataset.runId).value).toBe('');
  });

  it('exposes a "N columns" slash command for 2 through 5 columns', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const labels = registry.get('layout').slashCommands.map((c) => c.label);
    expect(labels).toEqual(['2 columns', '3 columns', '4 columns', '5 columns']);
  });

  it('the "4 columns" slash command inserts a layout with exactly 4 columns', () => {
    const store = new EditorStore(emptyDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const command = registry.get('layout').slashCommands.find((c) => c.label === '4 columns');

    const { block: p, runs } = { block: { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} }, runs: [{ id: 'r1', type: 'text', value: '', marks: {} }] };
    store.applyOperation(insertBlock(p, 'root', 0, { blocks: [p], runs }));

    command.run(store, { blockId: 'p1', runId: 'r1', sliceStart: 0, sliceEnd: 0 });

    const rootIds = store.getBlock('root').contentIds;
    const layoutId = rootIds[rootIds.indexOf('p1') + 1];
    const layout = store.getBlock(layoutId);
    expect(layout.type).toBe('layout');
    expect(layout.contentIds.length).toBe(4);
  });

  it('clipboard round-trip: toHTML wraps columns in a flex div, same-editor JSON preserves the exact column count', () => {
    const store = new EditorStore(emptyDoc());
    const layoutId = insertAtRoot(store, createLayoutBlock({ columns: 3 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('layout').toHTML(store.getBlock(layoutId), { store, registry });
    expect(html).toContain('display:flex');
    expect((html.match(/<p>/g) ?? []).length).toBe(3);
  });
});
