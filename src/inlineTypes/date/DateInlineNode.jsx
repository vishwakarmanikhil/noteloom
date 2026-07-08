import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';

/**
 * An atomic date chip — a real <input type="date">, proving the inline
 * mechanism generalizes to arbitrary native controls, not just <select>
 * (see selectInlineType). `EditableBlockContent` mounts this into an
 * imperatively-managed host element that carries `data-run-id`/
 * `contentEditable={false}` itself (via a React portal) — this component
 * only renders its own inner content/styling.
 */
export function DateInlineNode({ id }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleChange = useCallback(
    (event) => {
      store.applyOperation(updateRun(id, { data: { ...run?.data, isoDate: event.target.value } }));
    },
    [store, id, run?.data],
  );

  if (!run) return null;
  const { isoDate = '' } = run.data ?? {};

  return (
    <span
      className="be-inline-date"
      onMouseDown={(event) => event.stopPropagation()}
      // See SelectInlineNode's onKeyDown comment: without this, a keydown on
      // the date input (e.g. Backspace while editing it) still reaches
      // EditableBlockContent's onKeyDown via React's portal-following
      // synthetic bubbling, and can be misread as deleting this whole chip.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input type="date" value={isoDate} onChange={handleChange} />
    </span>
  );
}
