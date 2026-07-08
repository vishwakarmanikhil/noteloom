import { TableBlock } from './TableBlock.jsx';
import { TableRowBlock } from './TableRowBlock.jsx';
import { TableCellBlock } from './TableCellBlock.jsx';
import { runToHTML, runToPlainText, escapeHTML } from '../../inline/marks.js';
import { domInlineToRuns } from '../../inline/runOps.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTableBlock } from './createTableBlock.js';
import { resolveColumns } from './tableColumns.js';

// --- tableCell: near-identical to paragraph's toHTML/fromHTML/toPlainText ---

function cellToHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  return `<td>${runs.map((r) => runToHTML(r, ctx)).join('')}</td>`;
}

function cellToPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

function cellFromHTML(node, ctx) {
  if (node.tagName !== 'TD' && node.tagName !== 'TH') return null;
  const runs = domInlineToRuns(node, ctx);
  const block = { id: genId(), type: 'tableCell', parentId: null, contentIds: runs.map((r) => r.id), props: {} };
  return { block, runs };
}

// --- tableRow: pure container, recurses into cells via the registry ---

function rowToHTML(block, ctx) {
  const cellsHTML = block.contentIds
    .map((cellId) => {
      const cellBlock = ctx.store.getBlock(cellId);
      return ctx.registry.get(cellBlock.type).toHTML(cellBlock, ctx);
    })
    .join('');
  return `<tr>${cellsHTML}</tr>`;
}

function rowToPlainText(block, ctx) {
  return block.contentIds
    .map((cellId) => {
      const cellBlock = ctx.store.getBlock(cellId);
      return ctx.registry.get(cellBlock.type).toPlainText(cellBlock, ctx);
    })
    .join('\t');
}

function rowFromHTML(node, ctx) {
  if (node.tagName !== 'TR') return null;
  const cellNodes = [...node.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
  const rowId = genId();
  const cellBlocks = [];
  const runs = [];
  const contentIds = [];
  for (const cellNode of cellNodes) {
    const result = ctx.registry.get('tableCell').fromHTML(cellNode, ctx);
    if (!result) continue;
    result.block.parentId = rowId;
    cellBlocks.push(result.block);
    runs.push(...result.runs);
    contentIds.push(result.block.id);
  }
  const block = { id: rowId, type: 'tableRow', parentId: null, contentIds, props: {} };
  return { block, runs, subtreeBlocks: cellBlocks };
}

// --- table: container of rows ---

function tableToHTML(block, ctx) {
  const firstRow = block.contentIds[0] && ctx.store.getBlock(block.contentIds[0]);
  const columns = resolveColumns(block, firstRow?.contentIds?.length ?? 0);
  const theadHTML = columns.length
    ? `<thead><tr>${columns.map((c) => `<th>${escapeHTML(c.label ?? '')}</th>`).join('')}</tr></thead>`
    : '';

  const rowsHTML = block.contentIds
    .map((rowId) => {
      const rowBlock = ctx.store.getBlock(rowId);
      return ctx.registry.get(rowBlock.type).toHTML(rowBlock, ctx);
    })
    .join('');
  return `<table>${theadHTML}<tbody>${rowsHTML}</tbody></table>`;
}

function tableToPlainText(block, ctx) {
  return block.contentIds
    .map((rowId) => {
      const rowBlock = ctx.store.getBlock(rowId);
      return ctx.registry.get(rowBlock.type).toPlainText(rowBlock, ctx);
    })
    .join('\n');
}

function tableFromHTML(node, ctx) {
  if (node.tagName !== 'TABLE') return null;

  // A <thead> row holds column labels, not data — it must never be parsed
  // as a body row too (querySelectorAll('tr') would otherwise match it as
  // well as every <tbody> row, double-counting it). Its own labels are read
  // separately, into props.columns; external HTML with no <thead> at all
  // (pasted from another app) just gets none, and TableBlock/tableToHTML's
  // resolveColumns fallback generates sensible defaults for it.
  const theadRow = node.querySelector('thead tr');
  const bodyRowNodes = node.querySelector('tbody')
    ? [...node.querySelectorAll('tbody tr')]
    : [...node.querySelectorAll('tr')].filter((tr) => tr !== theadRow);

  const tableId = genId();
  const subtreeBlocks = [];
  const runs = [];
  const rowIds = [];
  for (const rowNode of bodyRowNodes) {
    const result = ctx.registry.get('tableRow').fromHTML(rowNode, ctx);
    if (!result) continue;
    result.block.parentId = tableId;
    for (const cellBlock of result.subtreeBlocks) cellBlock.parentId = result.block.id;
    subtreeBlocks.push(result.block, ...result.subtreeBlocks);
    runs.push(...result.runs);
    rowIds.push(result.block.id);
  }

  const props = {};
  if (theadRow) {
    const headerCells = [...theadRow.children].filter((c) => c.tagName === 'TH' || c.tagName === 'TD');
    props.columns = headerCells.map((cell) => ({ id: genId(), label: cell.textContent ?? '' }));
  }

  const block = { id: tableId, type: 'table', parentId: null, contentIds: rowIds, props };
  return { block, runs, subtreeBlocks };
}

export const tableCellBlockType = {
  component: TableCellBlock,
  isLeaf: true,
  defaultProps: {},
  toHTML: cellToHTML,
  toPlainText: cellToPlainText,
  fromHTML: cellFromHTML,
};

export const tableRowBlockType = {
  component: TableRowBlock,
  isLeaf: false,
  defaultProps: {},
  toHTML: rowToHTML,
  toPlainText: rowToPlainText,
  fromHTML: rowFromHTML,
};

export const tableBlockType = {
  component: TableBlock,
  isLeaf: false,
  defaultProps: {},
  toHTML: tableToHTML,
  toPlainText: tableToPlainText,
  fromHTML: tableFromHTML,
  slashCommand: {
    label: 'Table',
    keywords: ['table', 'grid'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTableBlock({ rows: 2, cols: 2 })),
  },
};
