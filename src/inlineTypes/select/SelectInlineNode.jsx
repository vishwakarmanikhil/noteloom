import { useCallback, useRef } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { Select } from '../../react/Select.jsx';
import { consumePendingAutoOpen } from '../../react/pendingAutoOpen.js';
import { focusAfterChip } from '../shared/advanceAfterPick.js';

/**
 * An atomic inline "chip" mixed directly into running text — e.g. a
 * diagnosis/complaint picker inside a paragraph, exactly like the old
 * notevo schema's inline `type: 'select'` runs. `EditableBlockContent`
 * mounts this into an imperatively-managed host element that carries
 * `data-run-id`/`contentEditable={false}` itself (via a React portal) — this
 * component only renders its own inner content/styling.
 *
 * Renders the shared searchable `Select` combobox — no inline add/remove-
 * option UI. A chip inserted via the `/select` command starts with an empty
 * options list (see index.js's slashCommand); populating/editing that list
 * is left to a host app's own options-source integration (see
 * createSelectFieldType for a full, named/reusable version of that idea),
 * to be revisited later.
 */
export function SelectInlineNode({ id, blockId }) {
  const store = useEditorStore();
  const run = useRun(id);
  // Consumed at most once per mount — see pendingAutoOpen.js. A plain
  // `useRef(null)` (not a lazy useState initializer) so the one-time
  // consumption survives React StrictMode's dev-only double-invocation of
  // component bodies without being triggered twice. Also doubles as "was
  // this chip inserted via the slash/@ menu" for handleChange below — a
  // chip picked up on an existing document (not just-inserted) doesn't
  // auto-advance on every later edit, only the fresh-insertion flow does.
  const autoOpenRef = useRef(null);
  if (autoOpenRef.current === null) autoOpenRef.current = consumePendingAutoOpen(id);

  const handleChange = useCallback(
    (selectedValue) => {
      store.applyOperation(updateRun(id, { data: { ...run?.data, selectedValue } }));
      // Completes the "insert -> auto-open -> pick" flow this chip started
      // with: picking a value lands the caret right after the chip, in the
      // SAME paragraph — the trailing-run focus a normal (non-auto-opening)
      // insertion already does immediately, just deferred until now so the
      // picker could take focus first.
      if (autoOpenRef.current) focusAfterChip(store, blockId, id);
    },
    [store, id, run?.data, blockId],
  );

  if (!run) return null;
  const { options = [], selectedValue = '', placeholder = 'Select…' } = run.data ?? {};

  return (
    <span
      className="be-inline-select"
      // preventDefault too, not just stopPropagation: the browser's default
      // mousedown action collapses the surrounding paragraph's text
      // selection/caret to wherever was clicked, even for a click that
      // lands on a nested non-text control like the Select's trigger
      // button or its search input — without this, that default caret-
      // collapse wins the timing race against Select's own
      // inputRef.current.focus() (called from a useEffect once the
      // popover mounts), so the very first character typed lands back in
      // the paragraph instead of the search box (same rationale as
      // FloatingToolbar's identical onMouseDown preventDefault).
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      // React re-dispatches bubbling synthetic events along the *React*
      // tree, not the physical DOM tree — since this chip is mounted via a
      // portal, a keydown on the Select below would otherwise still reach
      // EditableBlockContent's own onKeyDown and can be misread as e.g.
      // "Backspace next to this chip", deleting the whole chip instead of
      // just interacting with the dropdown.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Select
        value={selectedValue}
        options={options}
        onChange={handleChange}
        placeholder={placeholder}
        ariaLabel="Select an option"
        autoOpen={autoOpenRef.current}
      />
    </span>
  );
}
