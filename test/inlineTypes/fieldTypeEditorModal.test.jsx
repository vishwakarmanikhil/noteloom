import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider, useFieldTypeEditor } from '../../src/react/EditorProvider.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { FieldTypeEditorModal } from '../../src/inlineTypes/customSelect/FieldTypeEditorModal.jsx';
import { addFieldType } from '../../src/store/operations.js';

function makeDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function Harness() {
  const { openCreate, openEdit } = useFieldTypeEditor();
  return (
    <div>
      <button type="button" onClick={openCreate}>
        open-create
      </button>
      <button type="button" onClick={() => openEdit('ft1')}>
        open-edit
      </button>
      <FieldTypeEditorModal />
    </div>
  );
}

function renderHarness(store) {
  const inlineRegistry = createInlineRegistry();
  const { getByText } = render(
    <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
      <Harness />
    </EditorProvider>,
  );
  return { getByText, inlineRegistry };
}

describe('FieldTypeEditorModal: create flow', () => {
  it('creating a new field type persists it and registers it into the inline registry', () => {
    const store = new EditorStore(makeDoc());
    const { getByText, inlineRegistry } = renderHarness(store);

    fireEvent.click(getByText('open-create'));
    expect(document.querySelector('.be-modal-title').textContent).toBe('New field type');

    fireEvent.change(document.querySelector('input[placeholder="e.g. Priority, Status…"]'), { target: { value: 'Priority' } });
    fireEvent.change(document.querySelector('input[placeholder="New option…"]'), { target: { value: 'Low' } });
    fireEvent.click(document.querySelector('.be-table-header-menu-option-add'));
    fireEvent.change(document.querySelector('input[placeholder="New option…"]'), { target: { value: 'High' } });
    fireEvent.click(document.querySelector('.be-table-header-menu-option-add'));

    fireEvent.click(document.querySelector('.be-modal-save'));

    expect(document.querySelector('.be-modal-overlay')).toBeNull(); // closed

    const created = store.getFieldTypes();
    expect(created).toHaveLength(1);
    expect(created[0].label).toBe('Priority');
    expect(created[0].options.map((o) => o.label)).toEqual(['Low', 'High']);

    const entry = inlineRegistry.get(created[0].id);
    expect(entry).toBeDefined();
    expect(entry.slashCommand.label).toBe('Priority');
  });

  it('Cancel does not persist anything', () => {
    const store = new EditorStore(makeDoc());
    const { getByText } = renderHarness(store);

    fireEvent.click(getByText('open-create'));
    fireEvent.change(document.querySelector('input[placeholder="e.g. Priority, Status…"]'), { target: { value: 'Draft' } });
    fireEvent.click(document.querySelector('.be-modal-cancel'));

    expect(store.getFieldTypes()).toEqual([]);
    expect(document.querySelector('.be-modal-overlay')).toBeNull();
  });
});

describe('FieldTypeEditorModal: edit flow', () => {
  function seedExisting(store) {
    store.applyOperation(
      addFieldType({
        id: 'ft1',
        label: 'Priority',
        placeholder: 'Select…',
        variant: 'tag',
        options: [{ value: 'lo', label: 'Low', color: { bg: '#eee', text: '#111' } }],
      }),
    );
  }

  it('prefills the existing name/options, and Save applies edits via updateFieldType', () => {
    const store = new EditorStore(makeDoc());
    seedExisting(store);
    const { getByText, inlineRegistry } = renderHarness(store);

    fireEvent.click(getByText('open-edit'));
    expect(document.querySelector('.be-modal-title').textContent).toBe('Edit field type');
    expect(document.querySelector('input[placeholder="e.g. Priority, Status…"]').value).toBe('Priority');
    expect(document.querySelectorAll('.be-table-header-menu-option-row').length).toBeGreaterThanOrEqual(1);

    fireEvent.change(document.querySelector('input[placeholder="e.g. Priority, Status…"]'), { target: { value: 'Urgency' } });
    fireEvent.click(document.querySelector('.be-modal-save'));

    expect(store.getFieldType('ft1').label).toBe('Urgency');
    expect(store.getFieldTypes()).toHaveLength(1); // still just the one record, not a duplicate
    expect(inlineRegistry.get('ft1').slashCommand.label).toBe('Urgency');
  });

  it('Delete field type removes it from the store and unregisters it from the inline registry', () => {
    const store = new EditorStore(makeDoc());
    seedExisting(store);
    const { getByText, inlineRegistry } = renderHarness(store);

    // mount rehydrates ft1 into the registry via useRegisterFieldTypes
    expect(inlineRegistry.get('ft1')).toBeDefined();

    fireEvent.click(getByText('open-edit'));
    fireEvent.click(document.querySelector('.be-modal-delete'));

    expect(store.getFieldType('ft1')).toBeUndefined();
    expect(inlineRegistry.get('ft1')).toBeUndefined();
    expect(document.querySelector('.be-modal-overlay')).toBeNull();
  });

  it('does not show a Delete button while creating a brand-new type', () => {
    const store = new EditorStore(makeDoc());
    const { getByText } = renderHarness(store);
    fireEvent.click(getByText('open-create'));
    expect(document.querySelector('.be-modal-delete')).toBeNull();
  });
});
