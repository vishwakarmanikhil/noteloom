import { useCallback, useMemo, useState } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName, useInlineRegistry } from '../../react/EditorProvider.jsx';
import { insertRowAfter } from './tableEditCommands.js';
import { resolveColumns } from './tableColumns.js';
import { runPlainText, computeColumnAggregate, formatAggregateValue, AGGREGATE_SHORT_LABELS } from './tableView.js';
import { TableHeaderRow } from './TableHeaderRow.jsx';
import { PlusIcon } from '../../react/icons.jsx';

export function TableBlock({ id }) {
  const store = useEditorStore();
  const inlineRegistry = useInlineRegistry();
  const block = useBlock(id);
  // Local, non-persisted view state — a filter query per column id. Never
  // written to the document (no store operation, no undo step, not synced
  // to collaborators): hiding a row from THIS view is display-only, same
  // "don't touch real content for a view concern" reasoning as preview
  // mode's own hidden-block filtering. Resets on reload/navigating away —
  // a documented v1 limitation, not an oversight.
  const [filters, setFilters] = useState({});
  const handleFilterChange = useCallback((columnId, value) => {
    setFilters((prev) => (value ? { ...prev, [columnId]: value } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== columnId))));
  }, []);

  const handleAddRow = useCallback(() => {
    const lastRowId = block?.contentIds?.[block.contentIds.length - 1];
    if (lastRowId) insertRowAfter(store, lastRowId);
  }, [store, block]);

  const className = useBlockClassName('be-table-wrapper', block);

  const activeFilters = useMemo(() => Object.entries(filters).filter(([, q]) => q), [filters]);

  // Cell run lookup shared by both filtering (below) and the footer
  // aggregates — reads directly off the live store rather than through
  // React state, so it's always exactly what's currently in the document.
  const cellRun = useCallback(
    (rowId, colIndex) => {
      const row = store.getBlock(rowId);
      const cell = row && store.getBlock(row.contentIds[colIndex]);
      return cell ? store.getRun(cell.contentIds[0]) : null;
    },
    [store],
  );

  if (!block) return null;

  const firstRow = store.getBlock(block.contentIds[0]);
  const columns = resolveColumns(block, firstRow?.contentIds?.length ?? 0);

  // Every active filter must match (AND, not OR) — a row missing entirely
  // from one filtered column's criteria is hidden regardless of how well
  // it matches any other column's.
  const visibleRowIds =
    activeFilters.length === 0
      ? block.contentIds
      : block.contentIds.filter((rowId) =>
          activeFilters.every(([columnId, query]) => {
            const colIndex = columns.findIndex((c) => c.id === columnId);
            if (colIndex === -1) return true;
            const text = runPlainText(cellRun(rowId, colIndex), inlineRegistry);
            return text.toLowerCase().includes(query.toLowerCase());
          }),
        );

  const hasAggregates = columns.some((c) => c.aggregate && c.aggregate !== 'none');

  return (
    // be-table-scroll is a second, OUTER scroll boundary around
    // be-table-wrapper's own overflow-x:auto: a fixed-layout table whose
    // columns sum wider than the page can otherwise force its ancestors
    // (this block's row content, .be-surface, ...) to grow to fit it
    // instead of actually scrolling inside be-table-wrapper — depending on
    // the host app's own surrounding layout, that can bubble all the way
    // up to the whole page scrolling horizontally. This wrapper's own
    // max-width:100% + overflow-x:auto is a hard stop that can't be
    // out-grown by anything inside it, regardless of what's going on
    // further up the tree.
    <div className="be-table-scroll">
      <div className={className} data-block-id={id}>
        <table className="be-table">
          {/*
            A <colgroup> is what makes column resizing work at all: with
            table-layout: fixed (see CSS), every <col>'s own width applies
            uniformly to that column across the header row AND every body
            row's cell at that index — one <col> per column is the single
            source of truth for its rendered width, so TableCellBlock/
            TableRowBlock never need their own column-width prop-threading.
            data-col-index is how the header's own resize-drag handler finds
            and live-updates the right <col> imperatively while dragging (see
            ColumnHeaderCell), without touching React state on every
            mousemove.
          */}
          <colgroup>
            {columns.map((column, i) => (
              <col key={column.id} data-col-index={i} style={{ width: column.width }} />
            ))}
            <col className="be-table-header-spacer-col" />
          </colgroup>
          <TableHeaderRow tableId={id} columns={columns} filters={filters} onFilterChange={handleFilterChange} />
          <tbody>
            <BlockChildren parentId={id} filterIds={visibleRowIds} />
          </tbody>
          {hasAggregates && (
            <tfoot>
              <tr className="be-table-footer-row">
                {columns.map((column, colIndex) => {
                  const runs = visibleRowIds.map((rowId) => cellRun(rowId, colIndex));
                  const value = computeColumnAggregate(runs, column.type, column.aggregate, inlineRegistry);
                  return (
                    <td key={column.id} className="be-table-footer-cell">
                      {value != null && (
                        <>
                          <span className="be-table-footer-label">{AGGREGATE_SHORT_LABELS[column.aggregate]}</span>
                          {formatAggregateValue(value)}
                        </>
                      )}
                    </td>
                  );
                })}
                <td className="be-table-footer-spacer" aria-hidden="true" />
              </tr>
            </tfoot>
          )}
        </table>
        <button type="button" className="be-table-add-row" contentEditable={false} onClick={handleAddRow}>
          <PlusIcon size={14} /> Add row
        </button>
      </div>
    </div>
  );
}
