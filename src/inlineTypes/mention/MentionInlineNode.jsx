import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { DEMO_PEOPLE } from './demoPeople.js';

/**
 * An atomic "@name" mention chip — a second, semantically distinct inline
 * type (alongside select/date) proving the registry mechanism generalizes
 * without any special-casing beyond registering it. Backed by a fixed demo
 * roster since there's no real user directory in this package; a host app
 * would swap the options source for its own people/pages lookup.
 */
export function MentionInlineNode({ id }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleChange = useCallback(
    (event) => {
      const person = DEMO_PEOPLE.find((p) => p.id === event.target.value);
      store.applyOperation(updateRun(id, { data: { mentionId: person?.id ?? '', label: person?.label ?? '' } }));
    },
    [store, id],
  );

  if (!run) return null;
  const { mentionId = '' } = run.data ?? {};

  return (
    <span
      className="be-inline-mention"
      onMouseDown={(event) => event.stopPropagation()}
      // See SelectInlineNode's onKeyDown comment: without this, a keydown on
      // the select below still reaches EditableBlockContent's onKeyDown via
      // React's portal-following synthetic bubbling, and can be misread as
      // deleting this whole chip.
      onKeyDown={(event) => event.stopPropagation()}
    >
      @
      <select value={mentionId} onChange={handleChange}>
        <option value="" disabled>
          Mention…
        </option>
        {DEMO_PEOPLE.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </span>
  );
}
