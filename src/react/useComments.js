import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

const COMMENTS_KEY = '$comments';

/**
 * Subscribes to the store's comment threads (see src/comments/comments.js's
 * addComment/replyToComment/resolveComment/deleteComment) — reactive so a
 * comments sidebar/panel re-renders after any of those, the same way
 * useFieldTypes re-renders a field-type list.
 *
 * store.getComments() returns a referentially-stable array (cached,
 * invalidated only by a comments op) — required by useSyncExternalStore,
 * same contract as useFieldTypes/useBlock/useRun.
 */
export function useComments() {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(COMMENTS_KEY, onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getComments(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
