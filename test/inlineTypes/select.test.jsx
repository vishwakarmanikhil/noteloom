import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { selectInlineType } from '../../src/inlineTypes/select/index.js';

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

function renderChip(run) {
  const store = new EditorStore({
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['s1', 't1'], props: {} },
    ],
    runs: [run, { id: 't1', type: 'text', value: ' tail', marks: {} }],
  });
  const { container } = render(
    <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
      <EditableBlockContent blockId="p1" runIds={['s1', 't1']} />
    </EditorProvider>,
  );
  return { store, container };
}

describe('select inline type: rendering and choosing an existing option', () => {
  it('renders an atomic <select> island and changing it updates selectedValue', () => {
    const { store, container } = renderChip({
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: { options: [{ value: 'flu', label: 'Influenza' }], selectedValue: 'flu', placeholder: 'Select…' },
    });

    const chip = container.querySelector('[data-run-id="s1"]');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.querySelector('select').value).toBe('flu');

    fireEvent.change(chip.querySelector('select'), { target: { value: '' } });
    // no other option exists yet, so this just re-confirms the wiring
    expect(store.getRun('s1').data.selectedValue).toBe('');
  });
});

describe('select inline type: no inline add/remove-option UI (renders only the <select> itself)', () => {
  it('does not render an add-option button/input or a remove-selection button, even with options and a selection present', () => {
    const { container } = renderChip({
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: { options: [{ value: 'flu', label: 'Influenza' }], selectedValue: 'flu', placeholder: 'Select…' },
    });
    const chip = container.querySelector('[data-run-id="s1"]');

    expect(chip.querySelector('.be-inline-select-add')).toBeNull();
    expect(chip.querySelector('.be-inline-select-add-input')).toBeNull();
    expect(chip.querySelector('.be-inline-select-remove')).toBeNull();
    expect(chip.querySelector('select')).not.toBeNull(); // the select itself still renders
  });

  it('Backspace inside the chip does not delete it (regression: onKeyDown stopPropagation still applies with no other controls present)', () => {
    const { store, container } = renderChip({
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: { options: [], selectedValue: '', placeholder: 'Select…' },
    });
    const chip = container.querySelector('[data-run-id="s1"]');

    fireEvent.keyDown(chip.querySelector('select'), { key: 'Backspace' });

    expect(store.getRun('s1')).toBeDefined(); // chip untouched
    expect(container.querySelector('[data-run-id="s1"]')).not.toBeNull();
  });
});

describe('select inline type: serialization (unaffected by the add/remove UI)', () => {
  it('toHTML/fromHTML round-trip via its own marker', () => {
    const run = {
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: { options: [{ value: 'flu', label: 'Influenza' }], selectedValue: 'flu' },
    };
    const html = selectInlineType.toHTML(run);
    expect(html).toContain('data-inline-type="select"');
    expect(html).toContain('Influenza');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parsedRun = selectInlineType.fromHTML(doc.body.firstChild);
    expect(parsedRun.type).toBe('select');
    expect(parsedRun.data.selectedValue).toBe('flu');
  });
});
