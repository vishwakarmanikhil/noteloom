import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, useBlockRegistry, useInlineRegistry, useBlockRangeSelection } from './EditorProvider.jsx';
import { copyBlockRangeToClipboard } from '../clipboard/copyBlockRange.js';
import {
  deleteBlockRange,
  moveBlockRangeUp,
  moveBlockRangeDown,
  isEntireBlockRangeHidden,
  setBlockRangeHidden,
  reorderBlockRangeFromStore,
} from '../blocks/shared/blockRangeActions.js';
import { CopyIcon, ScissorsIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, EyeIcon, EyeOffIcon } from './icons.jsx';

/**
 * The action menu that appears once a gutter-margin drag (see
 * useBlockRangeDrag) finishes selecting a run of blocks — Copy, Cut,
 * Delete, Move up/down, Hide/Show in preview, all applied to the whole
 * range as one atomic undo step apiece. Mount this once anywhere under
 * EditorProvider (it reads useBlockRangeSelection itself, same pattern as
 * FieldTypeEditorModal); it renders nothing while nothing is range-selected.
 *
 * Positioned off the LAST selected block's own row — recomputed on every
 * range change (including live, mid-drag), so it visibly follows a
 * growing/shrinking selection rather than only appearing once, stale, at
 * mouseup.
 *
 * Outside-click/Escape/Delete are handled with a bespoke listener here
 * rather than the shared useOutsideClickAndEscape hook: a click on a
 * *different* block's gutter must start a brand-new drag (BlockGutterRow's
 * own onMouseDown → startDrag) rather than being swallowed as "outside
 * click, clear the old selection" — since both listeners are native
 * `mousedown` handlers, a generic ref-based exemption can't express "except
 * anywhere with a `.be-block-gutter` ancestor" the way this needs.
 */
export function BlockRangeActionMenu() {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();
  const [selectedBlockRange, setSelectedBlockRange] = useBlockRangeSelection();
  const [rect, setRect] = useState(null);
  const menuRef = useRef(null);

  const isOpen = selectedBlockRange.length > 0;
  const clear = useCallback(() => setSelectedBlockRange([]), [setSelectedBlockRange]);

  useEffect(() => {
    if (!isOpen) {
      setRect(null);
      return;
    }
    const lastId = selectedBlockRange[selectedBlockRange.length - 1];
    const el = document.querySelector(`[data-block-row-id="${lastId}"]`);
    setRect(el?.getBoundingClientRect() ?? null);
  }, [isOpen, selectedBlockRange]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (event.target.closest?.('.be-block-gutter')) return; // let that gutter's own drag-start take over
      clear();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        clear();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteBlockRange(store, selectedBlockRange);
        clear();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, store, selectedBlockRange, clear]);

  const handleCopy = useCallback(() => {
    copyBlockRangeToClipboard(store, registry, inlineRegistry, selectedBlockRange);
  }, [store, registry, inlineRegistry, selectedBlockRange]);

  const handleCut = useCallback(async () => {
    await copyBlockRangeToClipboard(store, registry, inlineRegistry, selectedBlockRange);
    deleteBlockRange(store, selectedBlockRange);
    clear();
  }, [store, registry, inlineRegistry, selectedBlockRange, clear]);

  const handleDelete = useCallback(() => {
    deleteBlockRange(store, selectedBlockRange);
    clear();
  }, [store, selectedBlockRange, clear]);

  const handleMoveUp = useCallback(() => {
    if (moveBlockRangeUp(store, selectedBlockRange)) {
      setSelectedBlockRange(reorderBlockRangeFromStore(store, selectedBlockRange));
    }
  }, [store, selectedBlockRange, setSelectedBlockRange]);

  const handleMoveDown = useCallback(() => {
    if (moveBlockRangeDown(store, selectedBlockRange)) {
      setSelectedBlockRange(reorderBlockRangeFromStore(store, selectedBlockRange));
    }
  }, [store, selectedBlockRange, setSelectedBlockRange]);

  const isHidden = isEntireBlockRangeHidden(store, selectedBlockRange);
  const handleToggleHidden = useCallback(() => {
    setBlockRangeHidden(store, selectedBlockRange, !isHidden);
    // This component isn't subscribed to individual blocks' own props (only
    // to selectedBlockRange itself), so a plain store mutation like the one
    // above doesn't by itself trigger a re-render — a fresh array with the
    // same ids does, which is enough to make `isHidden` above re-evaluate
    // against the store's now-updated props.
    setSelectedBlockRange((ids) => [...ids]);
  }, [store, selectedBlockRange, isHidden, setSelectedBlockRange]);

  if (!isOpen || !rect) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Selected blocks options"
      className="be-block-range-menu"
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left }}
    >
      <button type="button" role="menuitem" className="be-block-range-menu-item" onClick={handleCopy}>
        <CopyIcon size={15} /> Copy
      </button>
      <button type="button" role="menuitem" className="be-block-range-menu-item" onClick={handleCut}>
        <ScissorsIcon size={15} /> Cut
      </button>
      <button type="button" role="menuitem" className="be-block-range-menu-item" onClick={handleMoveUp}>
        <ArrowUpIcon size={15} /> Move up
      </button>
      <button type="button" role="menuitem" className="be-block-range-menu-item" onClick={handleMoveDown}>
        <ArrowDownIcon size={15} /> Move down
      </button>
      <button type="button" role="menuitem" className="be-block-range-menu-item" onClick={handleToggleHidden}>
        {isHidden ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
        {isHidden ? 'Show in preview' : 'Hide in preview'}
      </button>
      <button type="button" role="menuitem" className="be-block-range-menu-item be-block-range-menu-item-danger" onClick={handleDelete}>
        <TrashIcon size={15} /> Delete
      </button>
    </div>,
    document.body,
  );
}
