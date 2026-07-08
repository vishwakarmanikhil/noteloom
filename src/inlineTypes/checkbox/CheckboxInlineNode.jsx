import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';

/**
 * An atomic checkbox-with-label chip — pairs a toggle with its own free-text
 * label (e.g. "Diagnosis confirmed ☑") in one unit, distinct from a to-do
 * list item's `props.checked` (that's block-level state for a whole line;
 * this is inline content mixed into running text or, more commonly, a
 * table cell — see the "checkbox" table column type).
 */
export function CheckboxInlineNode({ id }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleCheckedChange = useCallback(
    (event) => {
      store.applyOperation(updateRun(id, { data: { ...run?.data, checked: event.target.checked } }));
    },
    [store, id, run?.data],
  );

  const handleLabelChange = useCallback(
    (event) => {
      store.applyOperation(updateRun(id, { data: { ...run?.data, label: event.target.value } }));
    },
    [store, id, run?.data],
  );

  if (!run) return null;
  const { checked = false, label = '' } = run.data ?? {};

  return (
    <span
      className="be-inline-checkbox"
      onMouseDown={(event) => event.stopPropagation()}
      // See SelectInlineNode's onKeyDown comment for why this is needed.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input type="checkbox" checked={checked} onChange={handleCheckedChange} />
      <input
        type="text"
        className="be-inline-checkbox-label"
        value={label}
        onChange={handleLabelChange}
        placeholder="Label…"
      />
    </span>
  );
}
