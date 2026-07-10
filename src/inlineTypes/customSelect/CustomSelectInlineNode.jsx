import { useCallback } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { Select } from '../../react/Select.jsx';

/**
 * The atomic chip for one instance of a named custom select field type
 * (see createSelectFieldType) — same mounting contract as SelectInlineNode
 * (host+portal, contentEditable=false, stopPropagation on mousedown/
 * keydown so the surrounding paragraph never steals focus/keys from it).
 *
 * Unlike SelectInlineNode, `options` here comes from the field type's OWN
 * config (closed over by the factory), not from `run.data` — every chip of
 * a given field type shares the same options source, matching how a
 * table's select column works (one shared list, not one per cell). Only
 * the resolved selection is ever written back to the run.
 */
export function CustomSelectInlineNode({ id, label, placeholder, variant, options, onManage, mention = false }) {
  const store = useEditorStore();
  const run = useRun(id);

  const handleChange = useCallback(
    (selectedValue, option) => {
      store.applyOperation(
        updateRun(id, {
          data: { selectedValue, selectedLabel: option?.label ?? '', selectedColor: option?.color },
        }),
      );
    },
    [store, id],
  );

  if (!run) return null;
  const { selectedValue = '', selectedLabel = '', selectedColor } = run.data ?? {};

  return (
    <span
      className="be-inline-select"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Select
        value={selectedValue}
        selectedLabel={selectedLabel}
        selectedColor={selectedColor}
        options={options}
        onChange={handleChange}
        placeholder={placeholder}
        variant={variant}
        ariaLabel={label}
        onManageOptions={onManage}
        mention={mention}
      />
    </span>
  );
}
