import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

/**
 * Subscribes to exactly one block by id. `store.getBlock(id)` is guaranteed
 * by EditorStore's mutation discipline to return the same reference across
 * renders unless that exact block changed, which is what makes this safe
 * with useSyncExternalStore (no infinite-loop / "getSnapshot should be
 * cached" warning). Never derive a new object from the snapshot here — do
 * that in the calling component with useMemo instead.
 */
export function useBlock(id) {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(id, onStoreChange), [store, id]);
  const getSnapshot = useCallback(() => store.getBlock(id), [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Same contract as useBlock, for inline Run leaves. */
export function useRun(id) {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(id, onStoreChange), [store, id]);
  const getSnapshot = useCallback(() => store.getRun(id), [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
