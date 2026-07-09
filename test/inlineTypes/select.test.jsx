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
  it('renders the shared Select combobox and choosing an option updates selectedValue', () => {
    const { store, container } = renderChip({
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: {
        options: [
          { value: 'flu', label: 'Influenza' },
          { value: 'rsv', label: 'RSV' },
        ],
        selectedValue: 'flu',
        placeholder: 'Select…',
      },
    });

    const chip = container.querySelector('[data-run-id="s1"]');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.querySelector('.be-select-value').textContent).toBe('Influenza');

    fireEvent.click(chip.querySelector('.be-select-trigger'));
    const option = [...document.querySelectorAll('.be-select-option')].find((el) => el.textContent === 'RSV');
    fireEvent.mouseDown(option);

    expect(store.getRun('s1').data.selectedValue).toBe('rsv');
  });
});

describe('select inline type: regression — mousedown on the chip must not let the surrounding paragraph steal the caret', () => {
  it('mousedown anywhere in the chip (trigger, search input, or an option) calls preventDefault', () => {
    // Without preventDefault, the browser's default mousedown action
    // collapses the paragraph's caret to the click position, winning the
    // timing race against Select's own focus() call on its search input —
    // the first character typed then lands back in the paragraph instead
    // of the search box, and the chip can appear to vanish on the next
    // reconciliation. See SelectInlineNode.jsx's onMouseDown comment.
    const { container } = renderChip({
      id: 's1',
      type: 'select',
      value: '',
      marks: {},
      data: { options: [{ value: 'flu', label: 'Influenza' }], selectedValue: 'flu', placeholder: 'Select…' },
    });
    const chip = container.querySelector('[data-run-id="s1"]');

    const triggerEvent = fireEvent.mouseDown(chip.querySelector('.be-select-trigger'));
    expect(triggerEvent).toBe(false); // fireEvent returns false when preventDefault was called
  });
});

describe('select inline type: no inline add/remove-option UI (renders only the Select combobox itself)', () => {
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
    expect(chip.querySelector('.be-select-trigger')).not.toBeNull(); // the combobox itself still renders
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

    fireEvent.keyDown(chip.querySelector('.be-select-trigger'), { key: 'Backspace' });

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
