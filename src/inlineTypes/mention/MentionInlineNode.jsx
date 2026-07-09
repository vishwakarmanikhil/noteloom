import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { Select } from '../../react/Select.jsx';
import { DEMO_PEOPLE } from './demoPeople.js';

const PEOPLE_OPTIONS = DEMO_PEOPLE.map((p) => ({ value: p.id, label: p.label }));

/**
 * An atomic "@name" mention chip — a second, semantically distinct inline
 * type (alongside select/date) proving the registry mechanism generalizes
 * without any special-casing beyond registering it. Backed by a fixed demo
 * roster since there's no real user directory in this package; a host app
 * would swap the options source for its own people/pages lookup — the
 * searchable Select combobox here is exactly the shape that lookup would
 * plug into (type-to-filter over however many people/pages there are).
 */
export function MentionInlineNode({ id }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleChange = useCallback(
    (mentionId, option) => {
      store.applyOperation(updateRun(id, { data: { mentionId, label: option?.label ?? '' } }));
    },
    [store, id],
  );

  if (!run) return null;
  const { mentionId = '' } = run.data ?? {};

  return (
    <span
      className="be-inline-mention"
      // preventDefault too, not just stopPropagation — see SelectInlineNode's
      // onMouseDown comment: without it, the browser's default caret-
      // collapse-to-click-position wins the race against Select's own
      // focus() call, and the first typed character lands in the
      // surrounding paragraph instead of the search box.
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      // See SelectInlineNode's onKeyDown comment: without this, a keydown on
      // the dropdown below still reaches EditableBlockContent's onKeyDown
      // via React's portal-following synthetic bubbling, and can be
      // misread as deleting this whole chip.
      onKeyDown={(event) => event.stopPropagation()}
    >
      @
      <Select value={mentionId} options={PEOPLE_OPTIONS} onChange={handleChange} placeholder="Mention…" ariaLabel="Mention a person" />
    </span>
  );
}
