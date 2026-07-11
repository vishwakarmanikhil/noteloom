import { useCallback } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName } from '../../react/EditorProvider.jsx';
import { insertRowAfter } from './tableEditCommands.js';
import { resolveColumns } from './tableColumns.js';
import { TableHeaderRow } from './TableHeaderRow.jsx';
import { PlusIcon } from '../../react/icons.jsx';

export function TableBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);

  const handleAddRow = useCallback(() => {
    const lastRowId = block?.contentIds?.[block.contentIds.length - 1];
    if (lastRowId) insertRowAfter(store, lastRowId);
  }, [store, block]);

  const className = useBlockClassName('be-table-wrapper', block);

  if (!block) return null;

  const firstRow = store.getBlock(block.contentIds[0]);
  const columns = resolveColumns(block, firstRow?.contentIds?.length ?? 0);

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
          <TableHeaderRow tableId={id} columns={columns} />
          <tbody>
            <BlockChildren parentId={id} />
          </tbody>
        </table>
        <button type="button" className="be-table-add-row" contentEditable={false} onClick={handleAddRow}>
          <PlusIcon size={14} /> Add row
        </button>
      </div>
    </div>
  );
}
