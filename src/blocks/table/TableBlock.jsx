import { useCallback } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
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

  if (!block) return null;

  const firstRow = store.getBlock(block.contentIds[0]);
  const columns = resolveColumns(block, firstRow?.contentIds?.length ?? 0);

  return (
    <div className="be-table-wrapper" data-block-id={id}>
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
  );
}
