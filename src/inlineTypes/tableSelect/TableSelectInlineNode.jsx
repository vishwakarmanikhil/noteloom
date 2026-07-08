import { useCallback } from 'react';
import { useRun, useBlock } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { resolveColumns } from '../../blocks/table/tableColumns.js';

/**
 * The atomic chip for a table's "select" column type — deliberately a
 * *different* inline type from the general-purpose `select` (used for
 * ad-hoc dropdown chips mixed into paragraph text), not a reuse of it. The
 * general one owns its options per-run with its own add/remove-option UI,
 * which is right for an independent inline chip but wrong for a table
 * column: every cell in a "select" column should offer the *same* choices
 * and stay in sync when an option is added, renamed, or removed. That
 * shared list lives on the table's own `props.columns[i].options` (see
 * tableColumns.js) — configured once from the column header's menu, not
 * per cell — so this component is intentionally table-aware (it resolves
 * its own containing cell -> row -> table via `blockId`, a coupling the
 * general inline types don't need and don't have).
 *
 * `useBlock(tableId)` (not a one-off `store.getBlock`) is what makes this
 * re-render when the column's options change elsewhere (the header menu)
 * even though this run itself didn't change.
 */
export function TableSelectInlineNode({ id, blockId }) {
  const store = useEditorStore();
  const run = useRun(id);

  const cell = blockId ? store.getBlock(blockId) : null;
  const row = cell ? store.getBlock(cell.parentId) : null;
  const tableId = row?.parentId ?? null;
  const table = useBlock(tableId);

  const colIndex = row ? row.contentIds.indexOf(blockId) : -1;
  const columns = table && row ? resolveColumns(table, row.contentIds.length) : [];
  const options = columns[colIndex]?.options ?? [];

  const handleChange = useCallback(
    (event) => {
      const selectedValue = event.target.value;
      const selectedLabel = options.find((opt) => opt.value === selectedValue)?.label ?? '';
      store.applyOperation(updateRun(id, { data: { selectedValue, selectedLabel } }));
    },
    [store, id, options],
  );

  if (!run) return null;
  const { selectedValue = '' } = run.data ?? {};

  return (
    <span
      className="be-inline-table-select"
      onMouseDown={(event) => event.stopPropagation()}
      // See SelectInlineNode's onKeyDown comment for why this is needed.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <select value={selectedValue} onChange={handleChange}>
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  );
}
