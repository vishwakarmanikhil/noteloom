import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { checkboxInlineType } from '../../src/inlineTypes/checkbox/index.js';

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

function makeDoc(data) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['c1'], props: {} },
    ],
    runs: [{ id: 'c1', type: 'checkbox', value: '', marks: {}, data }],
  };
}

describe('checkbox inline type', () => {
  it('renders an atomic checkbox + label input island', () => {
    const store = new EditorStore(makeDoc({ checked: true, label: 'Confirmed' }));
    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={['c1']} />
      </EditorProvider>,
    );

    const chip = container.querySelector('[data-run-id="c1"]');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(chip.querySelector('.be-inline-checkbox-label').value).toBe('Confirmed');
  });

  it('toggling the checkbox updates data.checked, editing the text input updates data.label', () => {
    const store = new EditorStore(makeDoc({ checked: false, label: '' }));
    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={['c1']} />
      </EditorProvider>,
    );

    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(store.getRun('c1').data.checked).toBe(true);

    fireEvent.change(container.querySelector('.be-inline-checkbox-label'), { target: { value: 'Reviewed' } });
    expect(store.getRun('c1').data.label).toBe('Reviewed');
  });

  it('toHTML/toPlainText format checked state + label, and fromHTML round-trips via its own marker', () => {
    const run = { id: 'c1', type: 'checkbox', value: '', marks: {}, data: { checked: true, label: 'Done' } };
    const html = checkboxInlineType.toHTML(run);
    expect(html).toBe('<span data-inline-type="checkbox" data-checked="true">☑ Done</span>');
    expect(checkboxInlineType.toPlainText(run)).toBe('[x] Done');

    const dom = new DOMParser().parseFromString(html, 'text/html');
    const parsed = checkboxInlineType.fromHTML(dom.querySelector('span'));
    expect(parsed.data).toEqual({ checked: true, label: 'Done' });
  });

  it('fromHTML ignores foreign HTML with no data-inline-type="checkbox" marker', () => {
    const dom = new DOMParser().parseFromString('<span>plain</span>', 'text/html');
    expect(checkboxInlineType.fromHTML(dom.querySelector('span'))).toBeNull();
  });
});
