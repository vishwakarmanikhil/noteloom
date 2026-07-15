import { useCallback, useState } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useSelectedBlock, useBlockClassName } from '../../react/EditorProvider.jsx';
import { insertSiblingSplitAtCaretAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { resolveBlockDir } from '../shared/resolveBlockDir.js';
import { ButtonEditModal } from './ButtonEditModal.jsx';

const DEFAULT_COLOR = '#2b6fd6';

/**
 * A leaf block (own runs, same mechanism as paragraph/heading) styled as a
 * clickable button, with `href`/`color`/`customAttrs` props. Editing the
 * label inline (click into the text, type, format, etc.) and *activating*
 * the button (following its link) are kept as two entirely separate
 * controls — a plain click inside the label only ever places the caret,
 * the same as any other block's text, and never navigates; the small
 * "open ↗" button is the only thing that does. The "⚙" button opens a
 * one-stop modal for label/link/color/custom-attributes (see
 * ButtonEditModal) as a faster consolidated alternative to editing the
 * label inline and there being nowhere else to set the rest.
 *
 * `customAttrs` (arbitrary name/value pairs from the modal) render as
 * data-* attributes directly on the pill element, not as raw injected
 * HTML/JS — a host app can hook its own CSS or event delegation onto
 * whatever attribute name it likes without this package needing to know
 * what for, without any injection risk.
 *
 * Enter creates a plain paragraph sibling (not another button), matching
 * heading's own convention — a run of several consecutive buttons from
 * repeated Enter isn't a sensible default.
 */
export function ButtonBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const { setSelectedBlockId } = useSelectedBlock();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleEnter = useCallback(() => {
    insertSiblingSplitAtCaretAndFocus(store, id, block?.contentIds ?? [], createTextLeafBlock('paragraph'));
  }, [store, id, block]);

  const handleBackspaceAtStart = useCallback(() => {
    const focusBlockId = mergeWithPreviousOrDelete(store, id);
    focusAfterMerge(store, focusBlockId, id, setSelectedBlockId);
  }, [store, id, setSelectedBlockId]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const openLink = useCallback(() => {
    const href = block?.props?.href;
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  }, [block?.props?.href]);

  const className = useBlockClassName('be-button-block', block);

  if (!block) return null;
  const href = block.props?.href ?? '';
  const color = block.props?.color ?? DEFAULT_COLOR;
  const customAttrs = block.props?.customAttrs ?? [];
  const isEmpty = isRunsEmpty(store, block.contentIds);

  const dataAttrs = {};
  for (const { key, value } of customAttrs) {
    if (key.trim()) dataAttrs[`data-${key.trim()}`] = value;
  }
  const dir = resolveBlockDir(store, block);

  return (
    <div className={className} data-block-id={id} dir={dir}>
      <div className="be-button-block-pill" style={{ backgroundColor: color }} {...dataAttrs}>
        <span className="be-button-block-label" data-empty={isEmpty ? '' : undefined} data-placeholder="Button">
          <EditableBlockContent
            blockId={id}
            runIds={block.contentIds}
            dir={dir}
            onEnter={handleEnter}
            onBackspaceAtStart={handleBackspaceAtStart}
            onArrowUp={handleArrowUp}
            onArrowDown={handleArrowDown}
          />
        </span>
        <button
          type="button"
          className="be-button-block-open"
          onClick={openLink}
          disabled={!href}
          title={href || 'No link set'}
          aria-label="Open link"
        >
          ↗
        </button>
        <button
          type="button"
          className="be-button-block-settings"
          onClick={() => setIsEditModalOpen(true)}
          aria-label="Edit button"
          title="Edit label, link, color…"
        >
          ⚙
        </button>
      </div>
      <ButtonEditModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} store={store} blockId={id} />
    </div>
  );
}
