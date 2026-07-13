import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, useBlockRangeSelection } from './EditorProvider.jsx';
import { useBlock } from './useBlock.js';
import { useOutsideClickAndEscape } from './useOutsideClickAndEscape.js';
import { useMenuKeyboardNav } from './useMenuKeyboardNav.js';
import { announce } from './liveAnnouncer.js';
import { BlockRenderer } from './BlockRenderer.jsx';
import { insertSiblingAfterAndFocus } from '../blocks/shared/blockCommands.js';
import { createTextLeafBlock } from '../blocks/shared/leafBlockFactory.js';
import { duplicateBlock, moveBlockUp, moveBlockDown, deleteBlockAndFocusSibling } from '../blocks/shared/blockActions.js';
import { updateBlockProps } from '../store/operations.js';
import { PlusIcon, GripVerticalIcon, CopyIcon, ArrowUpIcon, ArrowDownIcon, TrashIcon, EyeIcon, EyeOffIcon } from './icons.jsx';

/**
 * Wraps ONE top-level block with a hover-revealed left gutter — a "+" to
 * insert a new paragraph right after it, and a grip-handle trigger opening
 * a small menu (Duplicate / Move Up / Move Down / Hide-Show / Delete), the
 * same per-block affordance Notion/TipTap/editor.js all show. Only used for
 * TOP-LEVEL blocks (see BlockChildren's `isTopLevel` prop) — nested
 * content (list item children, table cells, layout columns) doesn't get
 * its own gutter, matching every one of those editors' own convention of
 * only offering this at the outermost level. Never rendered at all in
 * preview mode (see BlockChildren) — a preview isn't something you edit.
 *
 * Deliberately does not implement drag-and-drop reordering itself (a much
 * larger feature on its own) — the grip icon here is just the
 * conventional trigger for the menu; Move Up/Down cover reordering
 * instead. The menu is portaled to document.body (position:fixed off the
 * trigger's own rect), same convention as Select/SlashMenu/the table
 * header menu elsewhere in this codebase.
 *
 * "Hide"/"Show" toggles a generic `props.hidden` flag — works on any block
 * type since props is a free-form per-block object, no schema change
 * needed anywhere. In edit mode a hidden block still renders with full
 * functionality, just dimmed (see the be-block-row-hidden CSS) as a visual
 * reminder it won't appear once switched to preview mode, where
 * BlockChildren skips it entirely instead.
 *
 * `be-block-row-range-selected` (see useBlockRangeSelection) highlights
 * this row when it's part of a drag-selected block range — the actual
 * drag-start detection lives in useBlockRangeDrag, mounted once at the
 * surface level rather than here, since it needs to catch presses in the
 * blank page margin on either side of the content column too, not just
 * this row's own narrow gutter.
 */
export function BlockGutterRow({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const outsideRefs = useMemo(() => [triggerRef, menuRef], []);
  const [selectedBlockRange] = useBlockRangeSelection();
  const isRangeSelected = selectedBlockRange.includes(id);

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  useOutsideClickAndEscape(outsideRefs, isMenuOpen, closeMenu);
  useMenuKeyboardNav(menuRef, isMenuOpen, closeMenu, triggerRef);

  const openMenu = useCallback(() => {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setIsMenuOpen(true);
  }, []);

  const handleAdd = useCallback(() => {
    insertSiblingAfterAndFocus(store, id, createTextLeafBlock('paragraph'));
  }, [store, id]);

  const handleDuplicate = useCallback(() => {
    duplicateBlock(store, id);
    announce('Block duplicated');
    closeMenu();
  }, [store, id, closeMenu]);

  const handleMoveUp = useCallback(() => {
    if (moveBlockUp(store, id)) announce('Block moved up');
    closeMenu();
  }, [store, id, closeMenu]);

  const handleMoveDown = useCallback(() => {
    if (moveBlockDown(store, id)) announce('Block moved down');
    closeMenu();
  }, [store, id, closeMenu]);

  const handleDelete = useCallback(() => {
    deleteBlockAndFocusSibling(store, id);
    announce('Block deleted');
    closeMenu();
  }, [store, id, closeMenu]);

  const isHidden = Boolean(block?.props?.hidden);
  const handleToggleHidden = useCallback(() => {
    store.applyOperation(updateBlockProps(id, { hidden: !isHidden }));
    announce(isHidden ? 'Block shown in preview' : 'Block hidden in preview');
    closeMenu();
  }, [store, id, isHidden, closeMenu]);

  if (!block) return null;

  return (
    <div
      className={`be-block-row${isHidden ? ' be-block-row-hidden' : ''}${isRangeSelected ? ' be-block-row-range-selected' : ''}`}
      data-block-row-id={id}
    >
      <div className={`be-block-gutter${isMenuOpen ? ' be-block-gutter-active' : ''}`} contentEditable={false}>
        <button type="button" className="be-block-gutter-btn" onClick={handleAdd} aria-label="Add block below">
          <PlusIcon size={16} />
        </button>
        <button
          ref={triggerRef}
          type="button"
          className="be-block-gutter-btn"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => (isMenuOpen ? closeMenu() : openMenu())}
        >
          <GripVerticalIcon size={16} />
        </button>
      </div>
      <div className="be-block-row-content">
        <BlockRenderer id={id} />
      </div>
      {isMenuOpen &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Block options"
            className="be-block-gutter-menu"
            style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left }}
          >
            <button type="button" role="menuitem" className="be-block-gutter-menu-item" onClick={handleDuplicate}>
              <CopyIcon size={15} /> Duplicate
            </button>
            <button type="button" role="menuitem" className="be-block-gutter-menu-item" onClick={handleMoveUp}>
              <ArrowUpIcon size={15} /> Move up
            </button>
            <button type="button" role="menuitem" className="be-block-gutter-menu-item" onClick={handleMoveDown}>
              <ArrowDownIcon size={15} /> Move down
            </button>
            <button type="button" role="menuitem" className="be-block-gutter-menu-item" onClick={handleToggleHidden}>
              {isHidden ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
              {isHidden ? 'Show in preview' : 'Hide in preview'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="be-block-gutter-menu-item be-block-gutter-menu-item-danger"
              onClick={handleDelete}
            >
              <TrashIcon size={15} /> Delete
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
