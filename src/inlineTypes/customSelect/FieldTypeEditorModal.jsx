import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../react/Modal.jsx';
import { useEditorStore, useFieldTypeEditor } from '../../react/EditorProvider.jsx';
import { addFieldType, updateFieldType, removeFieldType } from '../../store/operations.js';
import { genId } from '../../utils/idGen.js';
import { XIcon } from '../../react/icons.jsx';
import { pickTagColor } from '../../blocks/table/tagColors.js';
import { useRegisterFieldTypes } from './useRegisterFieldTypes.js';

/**
 * Create/edit/delete UI for a user-created custom select field type — the
 * in-editor counterpart to a host app's code-only createSelectFieldType
 * calls. Mount this once anywhere under EditorProvider (it reads
 * useFieldTypeEditor() itself, so no props are required); wire a "+ New
 * field type" button to `useFieldTypeEditor().openCreate()`, and each
 * type's own chips reach the edit flow via their popover's "Manage
 * options…" entry (see createSelectFieldType's `onManage`).
 *
 * Reuses the same add/rename/remove-option-row shape as the table
 * column's SelectOptionsManager, plus a name field and Save/Cancel/Delete
 * — closer to ButtonEditModal's "load a draft, commit on Save" flow than
 * SelectOptionsManager's instant-write one, since creating a brand-new
 * type has no store record to write into until Save.
 *
 * Also owns useRegisterFieldTypes() — mounting this component is what
 * keeps the inline registry in sync with the store's fieldTypes list for
 * the whole session (rehydration + live add/edit/delete), not just what
 * renders the dialog.
 */
export function FieldTypeEditorModal() {
  useRegisterFieldTypes();
  const store = useEditorStore();
  const { target, close } = useFieldTypeEditor();
  const isOpen = target !== null;
  const isEditing = isOpen && target !== 'new';

  const [name, setName] = useState('');
  const [options, setOptions] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      const existing = store.getFieldType(target);
      setName(existing?.label ?? '');
      setOptions(existing?.options ?? []);
    } else {
      setName('');
      setOptions([]);
    }
    setDraft('');
  }, [isOpen, isEditing, target, store]);

  const handleRename = useCallback((value, label) => {
    setOptions((rows) => rows.map((o) => (o.value === value ? { ...o, label } : o)));
  }, []);

  const handleRemoveOption = useCallback((value) => {
    setOptions((rows) => rows.filter((o) => o.value !== value));
  }, []);

  const handleAddOption = useCallback(() => {
    const label = draft.trim();
    setDraft('');
    if (!label) return;
    setOptions((rows) => [...rows, { value: genId(), label, color: pickTagColor(rows.length) }]);
  }, [draft]);

  const handleSave = useCallback(() => {
    const label = name.trim();
    if (!label) return;
    if (isEditing) {
      store.applyOperation(updateFieldType(target, { label, options }));
    } else {
      store.applyOperation(
        addFieldType({ id: genId(), label, placeholder: 'Select…', variant: 'tag', options }),
      );
    }
    close();
  }, [store, isEditing, target, name, options, close]);

  const handleDelete = useCallback(() => {
    if (isEditing) store.applyOperation(removeFieldType(target));
    close();
  }, [store, isEditing, target, close]);

  return (
    <Modal isOpen={isOpen} onClose={close} title={isEditing ? 'Edit field type' : 'New field type'}>
      <label className="be-modal-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Priority, Status…"
          autoFocus
        />
      </label>

      <div className="be-modal-field">
        <span>Options</span>
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
              onClick={() => handleRemoveOption(option.value)}
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
                handleAddOption();
              }
            }}
          />
          <button type="button" className="be-table-header-menu-option-add" onClick={handleAddOption} aria-label="Add option">
            +
          </button>
        </div>
      </div>

      <div className="be-modal-actions">
        {isEditing && (
          <button type="button" className="be-modal-delete" onClick={handleDelete}>
            Delete field type
          </button>
        )}
        <button type="button" className="be-modal-cancel" onClick={close}>
          Cancel
        </button>
        <button type="button" className="be-modal-save" onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
}
