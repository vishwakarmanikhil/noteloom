import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore, useInlineRegistry } from '../../react/EditorProvider.jsx';
import { insertColumnAfter, deleteColumn, renameColumn, setColumnType, setColumnOptions } from './tableEditCommands.js';
import { COLUMN_TYPES } from './tableColumns.js';
import { genId } from '../../utils/idGen.js';
import { XIcon } from '../../react/icons.jsx';
import { Select } from '../../react/Select.jsx';

const TYPE_LABELS = { text: 'Text', date: 'Date', checkbox: 'Checkbox', select: 'Select' };
const TYPE_OPTIONS = COLUMN_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

/**
 * Manages a "select" column's shared option list (add/rename/remove) —
 * configured once here, for the whole column, rather than per cell. This
 * is the piece that makes a select column behave like Notion's Select
 * property instead of the general-purpose inline `select` type's
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
    setColumnOptions(store, tableId, colIndex, [...options, { value: genId(), label }]);
  }, [store, tableId, colIndex, options, draft]);

  return (
    <div className="be-table-header-menu-options">
      <div className="be-table-header-menu-options-label">Options</div>
      {options.map((option) => (
        <div key={option.value} className="be-table-header-menu-option-row">
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
 * One header cell: an editable label plus a small self-built menu (change
 * type, manage select options, insert column left/right, delete column) —
 * the same "own popup, close on outside-click/Escape" pattern SlashMenu
 * uses, kept local to this component rather than promoted to something
 * shared since it's simple enough not to need it.
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
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  const handleLabelChange = useCallback(
    (event) => renameColumn(store, tableId, colIndex, event.target.value),
    [store, tableId, colIndex],
  );
  const handleInsertLeft = useCallback(() => {
    insertColumnAfter(store, tableId, colIndex - 1);
    setIsMenuOpen(false);
  }, [store, tableId, colIndex]);
  const handleInsertRight = useCallback(() => {
    insertColumnAfter(store, tableId, colIndex);
    setIsMenuOpen(false);
  }, [store, tableId, colIndex]);
  const handleDelete = useCallback(() => {
    deleteColumn(store, tableId, colIndex);
    setIsMenuOpen(false);
  }, [store, tableId, colIndex]);
  const handleTypeChange = useCallback(
    (type) => setColumnType(store, tableId, colIndex, type, inlineRegistry),
    [store, tableId, colIndex, inlineRegistry],
  );

  return (
    <th className="be-table-header-cell" contentEditable={false}>
      <input
        className="be-table-header-label"
        value={column.label}
        onChange={handleLabelChange}
        aria-label={`Column ${colIndex + 1} name`}
      />
      <button
        type="button"
        className="be-table-header-menu-trigger"
        aria-label={`Column ${colIndex + 1} options`}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        &#8942;
      </button>
      {isMenuOpen && (
        <div ref={menuRef} role="menu" className="be-table-header-menu">
          <div className="be-table-header-menu-type">
            <span id={`be-table-col-type-${column.id}`}>Type</span>
            <Select
              value={column.type}
              options={TYPE_OPTIONS}
              onChange={handleTypeChange}
              ariaLabel="Column type"
              className="be-table-header-type-select"
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
        </div>
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
