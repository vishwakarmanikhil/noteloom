import { useEffect, useRef } from 'react';
import { useEditorStore, useInlineRegistry, useFieldTypeEditor } from '../../react/EditorProvider.jsx';
import { useFieldTypes } from '../../react/useFieldTypes.js';
import { registerStoredFieldTypes } from './registerStoredFieldTypes.js';

/**
 * Keeps the inline registry in sync with the store's persisted field types
 * for the lifetime of a mounted editor: re-registers on every add/rename/
 * options-edit (registerStoredFieldTypes overwrites in place, cheap), and
 * unregisters any id that's disappeared from the list (a deleted type) so
 * its InlineRegistry entry doesn't linger with a "Manage options…" pointing
 * at a record that no longer exists. Each chip's onManage opens
 * FieldTypeEditorModal via useFieldTypeEditor().openEdit.
 *
 * Called once by FieldTypeEditorModal itself, so mounting that single
 * component is enough to get both the create/edit UI and this rehydration/
 * live-sync behavior — a host app never needs to call this directly.
 */
export function useRegisterFieldTypes() {
  const store = useEditorStore();
  const inlineRegistry = useInlineRegistry();
  const fieldTypes = useFieldTypes();
  const { openEdit } = useFieldTypeEditor();
  const previousIdsRef = useRef([]);

  useEffect(() => {
    if (!inlineRegistry) return;
    const currentIds = new Set(fieldTypes.map((f) => f.id));
    for (const id of previousIdsRef.current) {
      if (!currentIds.has(id)) inlineRegistry.unregister(id);
    }
    registerStoredFieldTypes(store, inlineRegistry, { onManage: openEdit });
    previousIdsRef.current = [...currentIds];
  }, [store, inlineRegistry, fieldTypes, openEdit]);
}
