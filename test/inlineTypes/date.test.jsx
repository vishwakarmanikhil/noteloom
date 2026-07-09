import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { dateInlineType } from '../../src/inlineTypes/date/index.js';

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

describe('date inline type', () => {
  it('renders an atomic <input type="date"> island', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['d1'], props: {} },
      ],
      runs: [{ id: 'd1', type: 'date', value: '', marks: {}, data: { isoDate: '2026-07-04' } }],
    });
    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={['d1']} />
      </EditorProvider>,
    );

    const chip = container.querySelector('[data-run-id="d1"]');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    const input = chip.querySelector('input[type="date"]');
    expect(input.value).toBe('2026-07-04');
  });

  it('changing the date input updates the run\'s data', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['d1'], props: {} },
      ],
      runs: [{ id: 'd1', type: 'date', value: '', marks: {}, data: { isoDate: '2026-07-04' } }],
    });
    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={['d1']} />
      </EditorProvider>,
    );

    const input = container.querySelector('input[type="date"]');
    fireEvent.change(input, { target: { value: '2026-12-25' } });

    expect(store.getRun('d1').data.isoDate).toBe('2026-12-25');
  });

  it('toHTML/toPlainText format the date, and fromHTML round-trips via its own marker', () => {
    const run = { id: 'd1', type: 'date', value: '', marks: {}, data: { isoDate: '2026-07-04' } };
    const html = dateInlineType.toHTML(run);
    expect(html).toContain('data-inline-type="date"');
    expect(html).toContain('data-iso-date="2026-07-04"');
    expect(dateInlineType.toPlainText(run)).toMatch(/2026/);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parsedRun = dateInlineType.fromHTML(doc.body.firstChild);
    expect(parsedRun.type).toBe('date');
    expect(parsedRun.data.isoDate).toBe('2026-07-04');
  });

  it('fromHTML returns null for foreign HTML without the marker', () => {
    const doc = new DOMParser().parseFromString('<span>2026-07-04</span>', 'text/html');
    expect(dateInlineType.fromHTML(doc.body.firstChild)).toBeNull();
  });
});

describe('inline type registry generalizes across every registered type', () => {
  it('lists Select and Date as distinct slash commands with no special-casing', () => {
    const inlineRegistry = makeInlineRegistry();
    const labels = inlineRegistry.listSlashCommands().map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['Select', 'Date']));
  });
});
