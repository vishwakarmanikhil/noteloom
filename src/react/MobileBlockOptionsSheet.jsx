import { useCallback } from 'react';
import { Modal } from './Modal.jsx';
import { duplicateBlock, moveBlockUp, moveBlockDown, deleteBlockAndFocusSibling } from '../blocks/shared/blockActions.js';
import { updateBlockProps } from '../store/operations.js';
import { CopyIcon, ArrowUpIcon, ArrowDownIcon, TrashIcon, EyeIcon, EyeOffIcon } from './icons.jsx';

/**
 * The mobile counterpart to BlockGutterRow's own "grip handle" menu
 * (Duplicate / Move up / Move down / Hide-Show / Delete) — same actions,
 * same underlying handlers (duplicateBlock/moveBlockUp/moveBlockDown/
 * deleteBlockAndFocusSibling from blocks/shared/blockActions.js), just
 * reachable from MobileActionBar's "block options" button instead of a
 * hover-revealed gutter icon that has nothing to be revealed by on touch.
 *
 * `blockId` is always the TOP-LEVEL ancestor of wherever the caret
 * currently is (see MobileActionBar's findTopLevelAncestor) — matching
 * BlockGutterRow's own scope restriction to top-level blocks only; a caret
 * inside a table cell or callout still acts on the containing top-level
 * block, not the cell/callout itself.
 */
export function MobileBlockOptionsSheet({ isOpen, onClose, store, blockId }) {
  const block = blockId ? store.getBlock(blockId) : null;
  const isHidden = Boolean(block?.props?.hidden);

  const run = useCallback(
    (action) => {
      action();
      onClose();
    },
    [onClose],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Block options" variant="sheet">
      <div className="be-mobile-picker-list" role="menu" aria-label="Block options">
        <button
          type="button"
          role="menuitem"
          className="be-mobile-picker-item"
          onClick={() => run(() => duplicateBlock(store, blockId))}
        >
          <span className="be-mobile-picker-item-icon">
            <CopyIcon size={18} />
          </span>
          <span className="be-mobile-picker-item-label">Duplicate</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="be-mobile-picker-item"
          onClick={() => run(() => moveBlockUp(store, blockId))}
        >
          <span className="be-mobile-picker-item-icon">
            <ArrowUpIcon size={18} />
          </span>
          <span className="be-mobile-picker-item-label">Move up</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="be-mobile-picker-item"
          onClick={() => run(() => moveBlockDown(store, blockId))}
        >
          <span className="be-mobile-picker-item-icon">
            <ArrowDownIcon size={18} />
          </span>
          <span className="be-mobile-picker-item-label">Move down</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="be-mobile-picker-item"
          onClick={() => run(() => store.applyOperation(updateBlockProps(blockId, { hidden: !isHidden })))}
        >
          <span className="be-mobile-picker-item-icon">
            {isHidden ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
          </span>
          <span className="be-mobile-picker-item-label">{isHidden ? 'Show in preview' : 'Hide in preview'}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="be-mobile-picker-item be-mobile-picker-item-danger"
          onClick={() => run(() => deleteBlockAndFocusSibling(store, blockId))}
        >
          <span className="be-mobile-picker-item-icon">
            <TrashIcon size={18} />
          </span>
          <span className="be-mobile-picker-item-label">Delete</span>
        </button>
      </div>
    </Modal>
  );
}
