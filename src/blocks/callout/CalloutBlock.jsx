import { useCallback, useMemo, useRef, useState } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName } from '../../react/EditorProvider.jsx';
import { useOutsideClickAndEscape } from '../../react/useOutsideClickAndEscape.js';
import { updateBlockProps } from '../../store/operations.js';
import { DEFAULT_CALLOUT_ICON, DEFAULT_CALLOUT_COLOR } from './createCalloutBlock.js';

export const CALLOUT_COLORS = [
  { value: 'gray', label: 'Gray' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
];

/**
 * A plain container (contentIds hold child block ids, exactly like
 * layoutColumn/page) wrapped in a colored card with an editable icon — same
 * mechanism Notion/TipTap use for "callout": no bespoke text/run handling
 * of its own, so every child block (paragraph, list, another callout, ...)
 * gets full selection/copy/paste/format/undo support for free from the
 * shared container machinery, the same way layout columns already do.
 *
 * "Title" and "description" (see the CSS: `.be-callout-content > :first-
 * child` vs the rest) aren't a separate data shape — they're just the
 * first child block rendered bold vs. every child after it rendered
 * muted/smaller. That keeps the callout exactly as flexible as before (any
 * number of arbitrary child blocks, not a fixed two-field shape) while
 * still matching the title+description card look, since a callout's first
 * line reads as its heading in practice anyway.
 *
 * The icon is a plain text input rather than a dedicated emoji picker for
 * now (item 7 in the requested list) — swap this for that picker once it
 * exists; typing/pasting any emoji directly already works today.
 */
export function CalloutBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const [editingIcon, setEditingIcon] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const colorTriggerRef = useRef(null);
  const colorPickerRef = useRef(null);
  const colorOutsideRefs = useMemo(() => [colorTriggerRef, colorPickerRef], []);

  const closeColorPicker = useCallback(() => setIsColorPickerOpen(false), []);
  useOutsideClickAndEscape(colorOutsideRefs, isColorPickerOpen, closeColorPicker);

  const icon = block?.props?.icon ?? DEFAULT_CALLOUT_ICON;
  const color = block?.props?.color ?? DEFAULT_CALLOUT_COLOR;

  const commitIcon = useCallback(
    (event) => {
      const next = event.target.value.trim();
      if (next) store.applyOperation(updateBlockProps(id, { icon: next }));
      setEditingIcon(false);
    },
    [store, id],
  );

  const handleIconKeyDown = useCallback((event) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') setEditingIcon(false);
  }, []);

  const handleColorChange = useCallback(
    (next) => {
      store.applyOperation(updateBlockProps(id, { color: next }));
      setIsColorPickerOpen(false);
    },
    [store, id],
  );

  const className = useBlockClassName('be-callout', block);

  if (!block) return null;

  return (
    <div className={className} data-block-id={id} data-color={color}>
      <div className="be-callout-icon-wrap">
        {editingIcon ? (
          <input
            type="text"
            className="be-callout-icon-input"
            defaultValue={icon}
            autoFocus
            onBlur={commitIcon}
            onKeyDown={handleIconKeyDown}
            aria-label="Callout icon (paste or type an emoji)"
          />
        ) : (
          <button
            type="button"
            className="be-callout-icon"
            onClick={() => setEditingIcon(true)}
            aria-label="Change callout icon"
            title="Change icon"
          >
            {icon}
          </button>
        )}
      </div>

      <div className="be-callout-content">
        <BlockChildren parentId={id} />
      </div>

      <div className="be-callout-color-wrap" contentEditable={false}>
        <button
          ref={colorTriggerRef}
          type="button"
          className="be-callout-color-trigger"
          aria-label="Callout color"
          aria-haspopup="true"
          aria-expanded={isColorPickerOpen}
          title="Callout color"
          onClick={() => setIsColorPickerOpen((open) => !open)}
        >
          <span className={`be-callout-color-dot be-callout-color-dot-${color}`} />
        </button>
        {isColorPickerOpen && (
          <div ref={colorPickerRef} className="be-callout-color-picker" role="menu" aria-label="Callout color">
            {CALLOUT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="menuitem"
                className={`be-callout-color-option be-callout-color-option-${c.value}${
                  c.value === color ? ' be-callout-color-option-active' : ''
                }`}
                title={c.label}
                aria-label={c.label}
                onClick={() => handleColorChange(c.value)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
