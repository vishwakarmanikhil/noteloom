import { useCallback, useState } from 'react';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateBlockProps } from '../../store/operations.js';
import { DEFAULT_CALLOUT_ICON } from './createCalloutBlock.js';

/**
 * A plain container (contentIds hold child block ids, exactly like
 * layoutColumn/page) wrapped in a colored box with an editable icon — same
 * mechanism Notion/TipTap use for "callout": no bespoke text/run handling
 * of its own, so every child block (paragraph, list, another callout, ...)
 * gets full selection/copy/paste/format/undo support for free from the
 * shared container machinery, the same way layout columns already do.
 *
 * The icon is a plain text input rather than a dedicated emoji picker for
 * now (item 7 in the requested list) — swap this for that picker once it
 * exists; typing/pasting any emoji directly already works today.
 */
export function CalloutBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const [editingIcon, setEditingIcon] = useState(false);

  const icon = block?.props?.icon ?? DEFAULT_CALLOUT_ICON;

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

  if (!block) return null;

  return (
    <div className="be-callout" data-block-id={id}>
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
      <div className="be-callout-content">
        <BlockChildren parentId={id} />
      </div>
    </div>
  );
}
