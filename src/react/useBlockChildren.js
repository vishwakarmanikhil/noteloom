import { useCallback, useSyncExternalStore } from 'react';
import { useEditorStore } from './EditorProvider.jsx';

// Stable empty-array reference so a not-yet-existing/childless block never
// trips the useSyncExternalStore "snapshot changed" check by returning a
// fresh [] every call.
const EMPTY_CONTENT_IDS = [];

/**
 * Subscribes only to a block's `contentIds` array reference. EditorStore
 * only replaces that reference when membership/order actually changes
 * (insert/remove/move), never on a leaf edit inside one of the children —
 * so this hook (and the list-rendering component that calls it) does not
 * re-render on every keystroke inside a child, only on structural changes.
 */
export function useBlockChildren(parentId) {
  const store = useEditorStore();
  const subscribe = useCallback((onStoreChange) => store.subscribe(parentId, onStoreChange), [store, parentId]);
  const getSnapshot = useCallback(() => {
    const block = store.getBlock(parentId);
    return block ? block.contentIds : EMPTY_CONTENT_IDS;
  }, [store, parentId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
