import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

const PEOPLE_KEY = '$people';

/**
 * Subscribes to the document's own people list (see src/people/people.js) —
 * reactive so a "manage assignees" UI re-renders after add/update/remove,
 * including changes that arrived from a collaborator, the same way
 * useComments re-renders for remote comment activity. Not used by the
 * Assignee field type's own picker: that reads store.getPeople() fresh on
 * every keystroke via its options resolver, so a newly-added person shows
 * up there without any separate subscription.
 *
 * store.getPeople() returns a referentially-stable array (cached,
 * invalidated only by a people op, local or remote) — required by
 * useSyncExternalStore, same contract as useComments/useFieldTypes.
 */
export function usePeople() {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(PEOPLE_KEY, onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getPeople(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
