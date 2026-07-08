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
