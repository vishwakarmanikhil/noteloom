import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, useInlineRegistry } from '../../react/EditorProvider.jsx';
import { useOutsideClickAndEscape } from '../../react/useOutsideClickAndEscape.js';
import { useMenuKeyboardNav } from '../../react/useMenuKeyboardNav.js';
import { useAutoAdjustedRightLeft } from '../../react/usePopoverEdgeClamp.js';
import { insertColumnAfter, deleteColumn, renameColumn, setColumnType, setColumnOptions, setColumnWidth } from './tableEditCommands.js';
import { COLUMN_TYPES, MIN_COLUMN_WIDTH } from './tableColumns.js';
import { genId } from '../../utils/idGen.js';
import { XIcon } from '../../react/icons.jsx';
import { Select } from '../../react/Select.jsx';
import { pickTagColor } from './tagColors.js';

const TYPE_LABELS = { text: 'Text', date: 'Date', checkbox: 'Checkbox', select: 'Select' };
const TYPE_OPTIONS = COLUMN_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

// A column's actual drag width is unbounded (no real max exists in
// tableColumns.js) — this is only a hint for the resize handle's own
// aria-valuemax, so a screen reader has *some* sense of position within a
// reasonable range, not a value that's ever enforced against real dragging.
const MAX_COLUMN_WIDTH_HINT = 800;

/**
 * Manages a "select" column's shared option list (add/rename/remove) —
 * configured once here, for the whole column, rather than per cell. This
 * is the piece that makes a select column behave like a shared property
 * instead of the general-purpose inline `select` type's
 * independent-per-chip options: every cell reads the *same* list (see
 * TableSelectInlineNode), so it only needs managing in one place.
 */
function SelectOptionsManager({ tableId, colIndex, options }) {
  const store = useEditorStore();
  const [draft, setDraft] = useState('');

  const handleRename = useCallback(
    (optionValue, label) => {
      setColumnOptions(store, tableId, colIndex, options.map((o) => (o.value === optionValue ? { ...o, label } : o)));
    },
    [store, tableId, colIndex, options],
  );
  const handleRemove = useCallback(
    (optionValue) => setColumnOptions(store, tableId, colIndex, options.filter((o) => o.value !== optionValue)),
    [store, tableId, colIndex, options],
  );
  const handleAdd = useCallback(() => {
    const label = draft.trim();
    setDraft('');
    if (!label) return;
    // Color is assigned once, here, at creation time — not derived from
    // position at render time — so it stays the same tag color even after
    // other options are reordered/removed — a tag's color is fixed once
    // you pick/create it.
    setColumnOptions(store, tableId, colIndex, [...options, { value: genId(), label, color: pickTagColor(options.length) }]);
  }, [store, tableId, colIndex, options, draft]);

  return (
    <div className="be-table-header-menu-options">
      <div className="be-table-header-menu-options-label">Options</div>
      {options.map((option, i) => (
        <div key={option.value} className="be-table-header-menu-option-row">
          <span
            className="be-table-header-menu-option-swatch"
            style={{ background: (option.color ?? pickTagColor(i)).bg }}
            aria-hidden="true"
          />
          <input
            className="be-table-header-menu-option-input"
            value={option.label}
            onChange={(event) => handleRename(option.value, event.target.value)}
            aria-label={`Rename option ${option.label}`}
          />
          <button
            type="button"
            className="be-table-header-menu-option-remove"
            onClick={() => handleRemove(option.value)}
            aria-label={`Remove option ${option.label}`}
          >
            <XIcon size={14} />
          </button>
        </div>
      ))}
      <div className="be-table-header-menu-option-row">
        <input
          className="be-table-header-menu-option-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="New option…"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" className="be-table-header-menu-option-add" onClick={handleAdd} aria-label="Add option">
          +
        </button>
      </div>
    </div>
  );
}

/**
 * One header cell: an editable label, a small self-built menu (change
 * type, manage select options, insert column left/right, delete column),
 * and a drag handle on its right edge to resize the column.
 *
 * The menu is portaled to `document.body` (`position: fixed`, computed
 * from the trigger button's own bounding rect) — same convention as
 * Select/SlashMenu elsewhere in this codebase — instead of a plain
 * absolutely-positioned child of this `<th>`. A table can genuinely
 * overflow its wrapper (see `.be-table-wrapper`'s `overflow-x: auto`), and
 * a plain in-flow popup gets visually clipped by that; portaling escapes
 * it entirely, the same reason Select's own popover is portaled.
 *
 * Changing type runs every existing cell in the column through
 * setColumnType's data-preserving conversion (see tableColumns.js) rather
 * than discarding values — the actual gap this feature was built to close
 * versus the legacy notevo table it's modeled after.
 */
function ColumnHeaderCell({ tableId, column, colIndex, colCount }) {
  const store = useEditorStore();
  const inlineRegistry = useInlineRegistry();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [dragWidth, setDragWidth] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const thRef = useRef(null);
  const outsideRefs = useMemo(() => [triggerRef, menuRef], []);

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  useOutsideClickAndEscape(outsideRefs, isMenuOpen, closeMenu);
  useMenuKeyboardNav(menuRef, isMenuOpen, closeMenu, triggerRef);
  const rightLeft = useAutoAdjustedRightLeft(menuRef, isMenuOpen, rect?.right);

  const openMenu = useCallback(() => {
    // Anchor to the whole header cell, not the small vertically-centered
    // trigger icon (triggerRef) — using the icon's own rect put the menu's
    // top a few px below the icon's *midpoint*, which sat mid-cell and
    // overlapped the column label instead of opening cleanly below it.
    setRect(thRef.current?.getBoundingClientRect() ?? null);
    setIsMenuOpen(true);
  }, []);

  const handleLabelChange = useCallback(
    (event) => renameColumn(store, tableId, colIndex, event.target.value),
    [store, tableId, colIndex],
  );
  const handleInsertLeft = useCallback(() => {
    insertColumnAfter(store, tableId, colIndex - 1);
    closeMenu();
  }, [store, tableId, colIndex, closeMenu]);
  const handleInsertRight = useCallback(() => {
    insertColumnAfter(store, tableId, colIndex);
    closeMenu();
  }, [store, tableId, colIndex, closeMenu]);
  const handleDelete = useCallback(() => {
    deleteColumn(store, tableId, colIndex);
    closeMenu();
  }, [store, tableId, colIndex, closeMenu]);
  const handleTypeChange = useCallback(
    (type) => setColumnType(store, tableId, colIndex, type, inlineRegistry),
    [store, tableId, colIndex, inlineRegistry],
  );

  // Live-updates the <colgroup>'s own <col> element directly during drag
  // (see TableBlock.jsx's data-col-index) rather than dispatching a store
  // write on every mousemove — the store only gets ONE write, on mouseup,
  // matching EmbedBlock's own resize-handle convention.
  const handleResizeStart = useCallback(
    (event) => {
      event.preventDefault();
      const table = thRef.current?.closest('table');
      const col = table?.querySelector(`col[data-col-index="${colIndex}"]`);
      if (!col) return;
      const startWidth = thRef.current.getBoundingClientRect().width;
      const startX = event.clientX;

      const computeWidth = (moveEvent) => Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));

      const handleMouseMove = (moveEvent) => {
        const width = computeWidth(moveEvent);
        col.style.width = `${width}px`;
        setDragWidth(width);
      };
      const handleMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        setColumnWidth(store, tableId, colIndex, computeWidth(upEvent));
        setDragWidth(null);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [store, tableId, colIndex],
  );

  return (
    <th ref={thRef} scope="col" className="be-table-header-cell" contentEditable={false}>
      <input
        className="be-table-header-label"
        value={column.label}
        onChange={handleLabelChange}
        aria-label={`Column ${colIndex + 1} name`}
      />
      <button
        ref={triggerRef}
        type="button"
        className="be-table-header-menu-trigger"
        aria-label={`Column ${colIndex + 1} options`}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => (isMenuOpen ? closeMenu() : openMenu())}
      >
        &#8942;
      </button>
      <div
        className="be-table-col-resize-handle"
        onMouseDown={handleResizeStart}
        role="slider"
        aria-label={`Resize column ${colIndex + 1}`}
        aria-valuemin={MIN_COLUMN_WIDTH}
        aria-valuemax={MAX_COLUMN_WIDTH_HINT}
        aria-valuenow={dragWidth ?? column.width}
      />
      {isMenuOpen &&
        rect &&
        rightLeft != null &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Column ${colIndex + 1} options`}
            className="be-table-header-menu"
            style={{ position: 'fixed', top: rect.bottom + 4, left: rightLeft, transform: 'translateX(-100%)' }}
          >
            <div className="be-table-header-menu-type">
              <span id={`be-table-col-type-${column.id}`}>Type</span>
              <Select
                value={column.type}
                options={TYPE_OPTIONS}
                onChange={handleTypeChange}
                ariaLabel="Column type"
                className=""
              />
            </div>
            {column.type === 'select' && (
              <SelectOptionsManager tableId={tableId} colIndex={colIndex} options={column.options ?? []} />
            )}
            <button type="button" role="menuitem" className="be-table-header-menu-item" onClick={handleInsertLeft}>
              Insert column left
            </button>
            <button type="button" role="menuitem" className="be-table-header-menu-item" onClick={handleInsertRight}>
              Insert column right
            </button>
            <button
              type="button"
              role="menuitem"
              className="be-table-header-menu-item be-table-header-menu-item-danger"
              onClick={handleDelete}
              disabled={colCount <= 1}
            >
              Delete column
            </button>
          </div>,
          document.body,
        )}
    </th>
  );
}

/**
 * Renders as a real `<thead>` above the table's `<tbody>` (see TableBlock),
 * one `<th>` per column driven by the table's own `props.columns` metadata
 * (see tableColumns.js) — not a "block" of its own, since column labels
 * are table-level metadata, not content that needs runs/selection/undo
 * machinery of its own. A trailing spacer `<th>` keeps header columns
 * aligned with TableRowBlock's extra row-actions column.
 */
export function TableHeaderRow({ tableId, columns }) {
  return (
    <thead>
      <tr className="be-table-header-row">
        {columns.map((column, i) => (
          <ColumnHeaderCell key={column.id} tableId={tableId} column={column} colIndex={i} colCount={columns.length} />
        ))}
        <th className="be-table-header-spacer" aria-hidden="true" />
      </tr>
    </thead>
  );
}
