import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

const TITLE_KEY = '$title';

/**
 * Subscribes to the document's own title (see src/title/title.js) —
 * reactive so a title input re-renders when a change arrives from a
 * collaborator, not just a local edit. Same useSyncExternalStore contract
 * as usePeople/useComments/useFieldTypes.
 */
export function useTitle() {
  const store = useEditorStore();
  const subscribe = useCallback(
    (onStoreChange) => store.subscribe(TITLE_KEY, onStoreChange),
    [store],
  );
  const getSnapshot = useCallback(() => store.getTitle(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
