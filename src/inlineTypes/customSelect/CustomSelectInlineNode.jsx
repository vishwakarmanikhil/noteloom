import { useCallback, useRef } from 'react';
import { useRun } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateRun } from '../../store/operations.js';
import { Select } from '../../react/Select.jsx';
import { consumePendingAutoOpen } from '../../react/pendingAutoOpen.js';
import { focusAfterChip } from '../shared/advanceAfterPick.js';

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
export function CustomSelectInlineNode({
  id,
  blockId,
  label,
  placeholder,
  variant,
  options,
  onManage,
  mention = false,
}) {
  const store = useEditorStore();
  const run = useRun(id);
  // Consumed at most once per mount — see pendingAutoOpen.js and
  // SelectInlineNode's identical pattern (same reasoning: a plain ref
  // survives StrictMode's dev-only double-invocation without double-consuming).
  // Also doubles as "was this chip inserted via the slash/@ menu" for
  // handleChange below — see SelectInlineNode's identical comment.
  const autoOpenRef = useRef(null);
  if (autoOpenRef.current === null) autoOpenRef.current = consumePendingAutoOpen(id);

  const handleChange = useCallback(
    (selectedValue, option) => {
      store.applyOperation(
        updateRun(id, {
          data: { selectedValue, selectedLabel: option?.label ?? '', selectedColor: option?.color },
        }),
      );
      // Completes the "insert -> auto-open -> pick" flow — see
      // SelectInlineNode's identical comment.
      if (autoOpenRef.current) focusAfterChip(store, blockId, id);
    },
    [store, id, blockId],
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
        autoOpen={autoOpenRef.current}
      />
    </span>
  );
}
