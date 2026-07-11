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
      return undefined;
    }

    // Recomputed on scroll/resize, not just once per selection change — the
    // menu is position:fixed off a getBoundingClientRect() snapshot, which
    // is only valid for the instant it was measured. Without this, scrolling
    // the page after selecting a range leaves the menu stuck at its old
    // viewport position while the actual selected blocks scroll away
    // underneath it (exactly the "menu drifts away from the selection"
    // symptom) instead of staying anchored to the last selected block's row.
    const recompute = () => {
      const lastId = selectedBlockRange[selectedBlockRange.length - 1];
      const el = document.querySelector(`[data-block-row-id="${lastId}"]`);
      setRect(el?.getBoundingClientRect() ?? null);
    };
    recompute();
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
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
    clear();
  }, [store, registry, inlineRegistry, selectedBlockRange, clear]);

  const handleCut = useCallback(async () => {
    await copyBlockRangeToClipboard(store, registry, inlineRegistry, selectedBlockRange);
    deleteBlockRange(store, selectedBlockRange);
    clear();
  }, [store, registry, inlineRegistry, selectedBlockRange, clear]);

  const handleDelete = useCallback(() => {
    deleteBlockRange(store, selectedBlockRange);
    clear();
  }, [store, selectedBlockRange, clear]);

  // Every action below closes the menu and clears the selection once it's
  // done (matching "click an option, it acts on the selection, the
  // selection and menu both go away" — a host that wants to keep acting on
  // the same range repeatedly can just re-drag-select it) — Move up/down
  // and Hide/Show used to keep the range selected instead, to allow several
  // moves/toggles in a row without reselecting, but a lingering menu after
  // an action was already taken read as "did my click even do anything?".
  const handleMoveUp = useCallback(() => {
    moveBlockRangeUp(store, selectedBlockRange);
    clear();
  }, [store, selectedBlockRange, clear]);

  const handleMoveDown = useCallback(() => {
    moveBlockRangeDown(store, selectedBlockRange);
    clear();
  }, [store, selectedBlockRange, clear]);

  const isHidden = isEntireBlockRangeHidden(store, selectedBlockRange);
  const handleToggleHidden = useCallback(() => {
    setBlockRangeHidden(store, selectedBlockRange, !isHidden);
    clear();
  }, [store, selectedBlockRange, isHidden, clear]);

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
