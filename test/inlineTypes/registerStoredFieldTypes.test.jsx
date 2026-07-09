import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerStoredFieldTypes } from '../../src/inlineTypes/customSelect/registerStoredFieldTypes.js';
import { addFieldType } from '../../src/store/operations.js';

function makeDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

describe('registerStoredFieldTypes: outside-React rehydration', () => {
  it('registers every persisted field type into the inline registry by its stored id', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', placeholder: 'Select…', variant: 'tag', options: [] }));
    store.applyOperation(addFieldType({ id: 'ft2', label: 'Status', placeholder: 'Select…', variant: 'tag', options: [] }));

    const inlineRegistry = createInlineRegistry();
    registerStoredFieldTypes(store, inlineRegistry);

    expect(inlineRegistry.get('ft1')).toBeDefined();
    expect(inlineRegistry.get('ft1').slashCommand.label).toBe('Priority');
    expect(inlineRegistry.get('ft2').slashCommand.label).toBe('Status');
  });

  it('does nothing when the store has no field types', () => {
    const store = new EditorStore(makeDoc());
    const inlineRegistry = createInlineRegistry();
    registerStoredFieldTypes(store, inlineRegistry);
    expect(inlineRegistry.listSlashCommands()).toEqual([]);
  });

  it('wires onManage(id) as each type\'s "Manage options…" chip callback when given', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(
      addFieldType({
        id: 'ft1',
        label: 'Priority',
        placeholder: 'Select…',
        variant: 'tag',
        options: [{ value: 'lo', label: 'Low', color: { bg: '#eee', text: '#111' } }],
      }),
    );

    const seen = [];
    const inlineRegistry = createInlineRegistry();
    registerStoredFieldTypes(store, inlineRegistry, { onManage: (id) => seen.push(id) });

    store.blocks.set('root', { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} });
    store.blocks.set('p1', { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['run1'], props: {} });
    store.runs.set('run1', { id: 'run1', type: 'ft1', value: '', marks: {}, data: {} });

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
        <EditableBlockContent blockId="p1" runIds={['run1']} />
      </EditorProvider>,
    );

    const chip = container.querySelector('[data-run-id="run1"]');
    fireEvent.click(chip.querySelector('.be-select-trigger'));
    fireEvent.mouseDown(document.querySelector('.be-select-manage-options'));

    expect(seen).toEqual(['ft1']);
  });
});
