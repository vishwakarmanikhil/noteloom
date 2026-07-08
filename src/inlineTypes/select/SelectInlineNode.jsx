import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';

/**
 * An atomic inline "chip" mixed directly into running text — e.g. a
 * diagnosis/complaint picker inside a paragraph, exactly like the old
 * notevo schema's inline `type: 'select'` runs. `EditableBlockContent`
 * mounts this into an imperatively-managed host element that carries
 * `data-run-id`/`contentEditable={false}` itself (via a React portal) — this
 * component only renders its own inner content/styling.
 *
 * Renders just the <select> itself — no inline add/remove-option UI. A
 * chip inserted via the `/select` command starts with an empty options
 * list (see index.js's slashCommand); populating/editing that list is left
 * to a host app's own options-source integration (same as mention's
 * roster), to be revisited later.
 */
export function SelectInlineNode({ id }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleChange = useCallback(
    (event) => {
      store.applyOperation(updateRun(id, { data: { ...run?.data, selectedValue: event.target.value } }));
    },
    [store, id, run?.data],
  );

  if (!run) return null;
  const { options = [], selectedValue = '', placeholder = 'Select…' } = run.data ?? {};

  return (
    <span
      className="be-inline-select"
      // keep clicks/selection inside this atomic island from bubbling into
      // the parent contentEditable's native selection handling
      onMouseDown={(event) => event.stopPropagation()}
      // React re-dispatches bubbling synthetic events along the *React*
      // tree, not the physical DOM tree — since this chip is mounted via a
      // portal, a keydown on the <select> below would otherwise still reach
      // EditableBlockContent's own onKeyDown and can be misread as e.g.
      // "Backspace next to this chip", deleting the whole chip instead of
      // just interacting with the <select>.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <select value={selectedValue} onChange={handleChange}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  );
}
