import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

const FIELD_TYPES_KEY = '$fieldTypes';

/**
 * Subscribes to the store's persisted, user-created field type definitions
 * (see createSelectFieldType / registerStoredFieldTypes) — reactive so a
 * "manage field types" list re-renders after add/update/remove, the same
 * way useBlock re-renders on a single block's change. Not used by the
 * slash menu itself: that reads inlineRegistry.listSlashCommands() fresh
 * on every trigger, so a newly-registered type shows up there without any
 * separate subscription.
 *
 * store.getFieldTypes() returns a referentially-stable array (cached,
 * invalidated only by a fieldTypes op) — required by useSyncExternalStore,
 * same contract as useBlock/useRun.
 */
export function useFieldTypes() {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(FIELD_TYPES_KEY, onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.getFieldTypes(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
