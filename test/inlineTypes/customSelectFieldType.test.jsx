import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { createSelectFieldType } from '../../src/inlineTypes/customSelect/createSelectFieldType.jsx';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';

const STATIC_OPTIONS = [
  { value: 'lo', label: 'Low', color: { bg: '#e0f2e0', text: '#1a7a1a' } },
  { value: 'hi', label: 'High', color: { bg: '#f9e0e0', text: '#a11' } },
];

function renderChip(run, entry) {
  const inlineRegistry = createInlineRegistry();
  inlineRegistry.register(run.type, entry);
  const store = new EditorStore({
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: [run.id, 't1'], props: {} },
    ],
    runs: [run, { id: 't1', type: 'text', value: ' tail', marks: {} }],
  });
  const { container } = render(
    <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
      <EditableBlockContent blockId="p1" runIds={[run.id, 't1']} />
    </EditorProvider>,
  );
  return { store, container };
}

describe('createSelectFieldType: triggers config', () => {
  it('defaults to slash-only: slashCommand present, atCommand absent', () => {
    const entry = createSelectFieldType({ type: 'priority', label: 'Priority', options: STATIC_OPTIONS });
    expect(entry.slashCommand).toBeDefined();
    expect(entry.atCommand).toBeUndefined();
  });

  it('triggers: ["at"] flips it to @-only: atCommand present, slashCommand absent', () => {
    const entry = createSelectFieldType({ type: 'assignee', label: 'Assignee', options: STATIC_OPTIONS, triggers: ['at'] });
    expect(entry.atCommand).toBeDefined();
    expect(entry.slashCommand).toBeUndefined();
  });

  it('triggers: ["slash", "at"] populates both with the SAME command object (run behaves identically either way)', () => {
    const entry = createSelectFieldType({ type: 'assignee', label: 'Assignee', options: STATIC_OPTIONS, triggers: ['slash', 'at'] });
    expect(entry.slashCommand).toBeDefined();
    expect(entry.atCommand).toBeDefined();
    expect(entry.slashCommand).toBe(entry.atCommand);
  });
});

describe('createSelectFieldType: static options', () => {
  it('produces a full InlineRegistry entry and renders the shared option list as a tag select', () => {
    const entry = createSelectFieldType({ type: 'priority', label: 'Priority', variant: 'tag', options: STATIC_OPTIONS });
    expect(entry.isAtomic).toBe(true);
    expect(typeof entry.component).toBe('function');
    expect(entry.slashCommand.label).toBe('Priority');

    const { container } = renderChip({ id: 'run1', type: 'priority', value: '', marks: {}, data: {} }, entry);
    const chip = container.querySelector('[data-run-id="run1"]');

    fireEvent.click(chip.querySelector('.be-select-trigger'));
    const options = [...document.querySelectorAll('.be-select-option')].map((el) => el.textContent);
    expect(options).toEqual(['Low', 'High']);
  });

  it('picking an option writes selectedValue/selectedLabel/selectedColor onto the run (not the options list itself)', () => {
    const entry = createSelectFieldType({ type: 'priority', label: 'Priority', variant: 'tag', options: STATIC_OPTIONS });
    const { store, container } = renderChip({ id: 'run1', type: 'priority', value: '', marks: {}, data: {} }, entry);
    const chip = container.querySelector('[data-run-id="run1"]');

    fireEvent.click(chip.querySelector('.be-select-trigger'));
    fireEvent.mouseDown(document.querySelectorAll('.be-select-option')[1]); // High

    expect(store.getRun('run1').data).toEqual({
      selectedValue: 'hi',
      selectedLabel: 'High',
      selectedColor: { bg: '#f9e0e0', text: '#a11' },
    });
    expect(store.getRun('run1').data.options).toBeUndefined(); // never denormalizes the whole list onto the run
  });

  it('toHTML/toPlainText/fromHTML round-trip via the resolved label only', () => {
    const entry = createSelectFieldType({ type: 'priority', label: 'Priority', options: STATIC_OPTIONS });
    const run = { id: 'run1', type: 'priority', value: '', marks: {}, data: { selectedValue: 'hi', selectedLabel: 'High' } };

    expect(entry.toPlainText(run)).toBe('High');
    const html = entry.toHTML(run);
    expect(html).toContain('data-inline-type="priority"');
    expect(html).toContain('data-selected-value="hi"');
    expect(html).toContain('High');

    const dom = new DOMParser().parseFromString(html, 'text/html');
    const node = dom.body.firstElementChild;
    const reconstructed = entry.fromHTML(node);
    expect(reconstructed.type).toBe('priority');
    expect(reconstructed.data.selectedValue).toBe('hi');
    expect(reconstructed.data.selectedLabel).toBe('High');

    // A node without our own marker is correctly NOT claimed (foreign HTML falls through).
    const foreign = dom.createElement('span');
    foreign.textContent = 'not ours';
    expect(entry.fromHTML(foreign)).toBeNull();
  });
});

describe('createSelectFieldType: dynamic (function) options', () => {
  it('forwards a function options source straight through to Select, resolving asynchronously', async () => {
    vi.useFakeTimers();
    try {
      const resolver = vi.fn().mockResolvedValue([{ value: 'x', label: 'Async Option' }]);
      const entry = createSelectFieldType({ type: 'assignee', label: 'Assignee', options: resolver });
      const { container } = renderChip({ id: 'run1', type: 'assignee', value: '', marks: {}, data: {} }, entry);
      const chip = container.querySelector('[data-run-id="run1"]');

      fireEvent.click(chip.querySelector('.be-select-trigger'));
      await act(async () => {
        vi.advanceTimersByTime(250);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(resolver).toHaveBeenCalled();
      expect(document.querySelector('.be-select-option').textContent).toBe('Async Option');
    } finally {
      vi.useRealTimers();
    }
  });
});
