import { useCallback } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { deleteRow } from './tableEditCommands.js';
import { XIcon } from '../../react/icons.jsx';

// Reuses the exact same container/tree-walking mechanism as every other
// non-leaf block (page, layout column, list item children) — the only
// difference is the wrapping <tr> tag.
export function TableRowBlock({ id }) {
  const store = useEditorStore();
  const handleDeleteRow = useCallback(() => deleteRow(store, id), [store, id]);

  return (
    <tr className="be-table-row" data-block-id={id}>
      <BlockChildren parentId={id} />
      <td className="be-table-row-actions" contentEditable={false}>
        <button type="button" className="be-table-delete-row" onClick={handleDeleteRow} aria-label="Delete row" title="Delete row">
          <XIcon size={14} />
        </button>
      </td>
    </tr>
  );
}
