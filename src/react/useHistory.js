import { useCallback, useSyncExternalStore } from 'react';
import { useEditorContext } from './EditorProvider.jsx';
import { restoreSelectionAfterHistoryChange } from './restoreHistorySelection.js';

const STABLE_STATE = { canUndo: false, canRedo: false };

/**
 * Subscribes to undo/redo availability, for wiring up toolbar buttons.
 * Returns null if the editor was created without a History instance (i.e.
 * the provider was given a plain EditorStore).
 */
export function useHistory() {
  const { history } = useEditorContext();

  const subscribe = useCallback(
    (onChange) => (history ? history.subscribeToHistory(onChange) : () => {}),
    [history],
  );
  const getSnapshot = useCallback(
    () => (history ? history.getUndoRedoSnapshot() : STABLE_STATE),
    [history],
  );

  const state = useSyncExternalStore(subscribe, getSnapshot);
  if (!history) return null;

  return {
    ...state,
    undo: () => {
      const changed = history.undo();
      if (changed) restoreSelectionAfterHistoryChange(history);
      return changed;
    },
    redo: () => {
      const changed = history.redo();
      if (changed) restoreSelectionAfterHistoryChange(history);
      return changed;
    },
    getHistoryLog: () => history.getHistoryLog(),
  };
}
