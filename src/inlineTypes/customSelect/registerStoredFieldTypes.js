import { createSelectFieldType } from './createSelectFieldType.jsx';

/**
 * Re-registers every persisted, user-created field type (store.getFieldTypes())
 * into the given inline registry — the rehydration step that makes a
 * previously-created custom select type usable again after a fresh page
 * load/store construction, without the host app needing to know what
 * types exist ahead of time (unlike code-defined types, which the host
 * itself registers via createSelectFieldType at setup time).
 *
 * `onManage(id)`, if given, becomes each type's "Manage options…" chip
 * affordance (see createSelectFieldType's own `onManage` param) — pass
 * `useFieldTypeEditor().openEdit` from React (see useRegisterFieldTypes,
 * which wraps this reactively). Safe to call directly, outside React too
 * (e.g. right after `new EditorStore(doc)`, or in tests) when no "manage"
 * UI is needed.
 */
export function registerStoredFieldTypes(store, inlineRegistry, { onManage } = {}) {
  for (const fieldType of store.getFieldTypes()) {
    inlineRegistry.register(
      fieldType.id,
      createSelectFieldType({
        type: fieldType.id,
        label: fieldType.label,
        placeholder: fieldType.placeholder,
        variant: fieldType.variant,
        options: fieldType.options ?? [],
        onManage: onManage ? () => onManage(fieldType.id) : undefined,
      }),
    );
  }
}
