import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { selectInlineType } from '../../src/inlineTypes/select/index.js';
import { createSelectFieldType } from '../../src/inlineTypes/customSelect/createSelectFieldType.jsx';
import { updateRun } from '../../src/store/operations.js';

// focusAfterChip (used by SelectInlineNode/CustomSelectInlineNode after a
// pick) bottoms out in focusRunEnd, which is rAF-deferred and DOM-based —
// mocking it lets these tests assert "focus moved to the right run" as a
// plain function call, matching indentFocus.test.js's identical pattern,
// instead of needing a real rAF flush + DOM focus assertions.
vi.mock('../../src/react/focusRun.js', () => ({ focusRunEnd: vi.fn() }));
import { focusRunEnd } from '../../src/react/focusRun.js';

function makeInlineRegistry() {
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return inlineRegistry;
}

describe('select inline type: picking an option after a fresh insertion focuses the trailing text right after the chip, in the SAME block', () => {
  it('inserted mid-sentence (text before AND after the chip), then picking lands the caret in the trailing text', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      // "Diagnosis: /select please" -- the slash command sits between real
      // text before and after it, matching a real mid-sentence insertion.
      runs: [{ id: 'r1', type: 'text', value: 'Diagnosis: /select please', marks: {} }],
    });
    selectInlineType.slashCommand.run(store, {
      blockId: 'p1',
      runId: 'r1',
      sliceStart: 11,
      sliceEnd: 18,
    });
    const [beforeRunId, chipRunId, afterRunId] = store.getBlock('p1').contentIds;
    expect(store.getRun(beforeRunId).value).toBe('Diagnosis: ');
    expect(store.getRun(afterRunId).value).toBe(' please');

    store.applyOperation(
      updateRun(chipRunId, {
        data: {
          options: [{ value: 'flu', label: 'Influenza' }],
          selectedValue: '',
          placeholder: 'Select…',
        },
      }),
    );
    focusRunEnd.mockClear();

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={store.getBlock('p1').contentIds} />
      </EditorProvider>,
    );
    const chip = container.querySelector(`[data-run-id="${chipRunId}"]`);
    fireEvent.mouseDown(document.querySelector('.be-select-option'));

    expect(store.getRun(chipRunId).data.selectedValue).toBe('flu');
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(afterRunId); // the SAME block's own trailing run — not a different block
    expect(chip).not.toBeNull();
  });

  it('regression: picking via keyboard (type to filter, then Enter) also lands in the trailing run of the SAME block', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '/select', marks: {} }],
    });
    selectInlineType.slashCommand.run(store, {
      blockId: 'p1',
      runId: 'r1',
      sliceStart: 0,
      sliceEnd: 7,
    });
    const [, chipRunId, afterRunId] = store.getBlock('p1').contentIds;
    store.applyOperation(
      updateRun(chipRunId, {
        data: {
          options: [
            { value: 'flu', label: 'Influenza' },
            { value: 'rsv', label: 'RSV' },
          ],
          selectedValue: '',
          placeholder: 'Select…',
        },
      }),
    );
    focusRunEnd.mockClear();

    render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={store.getBlock('p1').contentIds} />
      </EditorProvider>,
    );

    const search = document.querySelector('.be-select-search');
    fireEvent.change(search, { target: { value: 'rsv' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(store.getRun(chipRunId).data.selectedValue).toBe('rsv');
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(afterRunId);
  });

  it('does NOT jump to a different (sibling) block, even when one exists right after', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: '/select', marks: {} },
        { id: 'r2', type: 'text', value: 'a different block entirely', marks: {} },
      ],
    });
    selectInlineType.slashCommand.run(store, {
      blockId: 'p1',
      runId: 'r1',
      sliceStart: 0,
      sliceEnd: 7,
    });
    const [, chipRunId, afterRunId] = store.getBlock('p1').contentIds;
    store.applyOperation(
      updateRun(chipRunId, {
        data: {
          options: [{ value: 'flu', label: 'Influenza' }],
          selectedValue: '',
          placeholder: 'Select…',
        },
      }),
    );
    focusRunEnd.mockClear();

    render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={store.getBlock('p1').contentIds} />
      </EditorProvider>,
    );
    fireEvent.mouseDown(document.querySelector('.be-select-option'));

    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(afterRunId); // p1's own trailing run, NOT r2/p2
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']); // no new block created either
  });

  it('a chip rendered from EXISTING (already-persisted) content does NOT auto-focus on a later value change', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['s1', 't1'], props: {} },
      ],
      runs: [
        {
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
        },
        { id: 't1', type: 'text', value: ' tail', marks: {} },
      ],
    });
    focusRunEnd.mockClear();

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="p1" runIds={['s1', 't1']} />
      </EditorProvider>,
    );
    const chip = container.querySelector('[data-run-id="s1"]');

    fireEvent.click(chip.querySelector('.be-select-trigger'));
    const rsvOption = [...document.querySelectorAll('.be-select-option')].find(
      (el) => el.textContent === 'RSV',
    );
    fireEvent.mouseDown(rsvOption);

    expect(store.getRun('s1').data.selectedValue).toBe('rsv');
    expect(focusRunEnd).not.toHaveBeenCalled();
  });

  it('regression: end-to-end through a real listItem (its own runs live in props.titleRunIds) — inserted, then picking lands in the trailing title text, no new block created', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r1'] },
        },
      ],
      runs: [{ id: 'r1', type: 'text', value: '/select please', marks: {} }],
    });
    selectInlineType.slashCommand.run(store, {
      blockId: 'li1',
      runId: 'r1',
      sliceStart: 0,
      sliceEnd: 7,
    });
    const [, chipRunId, afterRunId] = store.getBlock('li1').props.titleRunIds; // element 0 is the empty "before" run (sliceStart is 0)
    expect(store.getRun(afterRunId).value).toBe(' please');
    store.applyOperation(
      updateRun(chipRunId, {
        data: {
          options: [{ value: 'flu', label: 'Influenza' }],
          selectedValue: '',
          placeholder: 'Select…',
        },
      }),
    );
    focusRunEnd.mockClear();

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={makeInlineRegistry()}>
        <EditableBlockContent blockId="li1" runIds={store.getBlock('li1').props.titleRunIds} />
      </EditorProvider>,
    );
    const chip = container.querySelector(`[data-run-id="${chipRunId}"]`);
    fireEvent.mouseDown(document.querySelector('.be-select-option'));

    expect(store.getRun(chipRunId).data.selectedValue).toBe('flu');
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(afterRunId); // the list item's own trailing title run
    expect(store.getBlock('root').contentIds).toEqual(['li1']); // no new block created
    expect(chip).not.toBeNull();
  });
});

describe('createSelectFieldType: picking an option after a fresh insertion focuses the trailing text right after the chip, in the SAME block', () => {
  it('inserted mid-sentence, then picking lands the caret in the trailing text of the SAME block', () => {
    const entry = createSelectFieldType({
      type: 'priority',
      label: 'Priority',
      options: [
        { value: 'lo', label: 'Low' },
        { value: 'hi', label: 'High' },
      ],
    });
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register('priority', entry);

    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: '/priority please', marks: {} },
        { id: 'r2', type: 'text', value: 'a different block entirely', marks: {} },
      ],
    });
    entry.slashCommand.run(store, { blockId: 'p1', runId: 'r1', sliceStart: 0, sliceEnd: 9 });
    const [, chipRunId, afterRunId] = store.getBlock('p1').contentIds; // element 0 is the empty "before" run (sliceStart is 0)
    expect(store.getRun(afterRunId).value).toBe(' please');
    focusRunEnd.mockClear();

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
        <EditableBlockContent blockId="p1" runIds={store.getBlock('p1').contentIds} />
      </EditorProvider>,
    );

    const chip = container.querySelector(`[data-run-id="${chipRunId}"]`);
    const highOption = [...document.querySelectorAll('.be-select-option')].find(
      (el) => el.textContent === 'High',
    );
    fireEvent.mouseDown(highOption);

    expect(store.getRun(chipRunId).data.selectedValue).toBe('hi');
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(afterRunId); // p1's own trailing run, NOT r2/p2
    expect(chip).not.toBeNull();
  });

  it('a chip rendered from EXISTING (already-persisted) content does NOT auto-focus on a later value change', () => {
    const entry = createSelectFieldType({
      type: 'priority',
      label: 'Priority',
      options: [
        { value: 'lo', label: 'Low' },
        { value: 'hi', label: 'High' },
      ],
    });
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register('priority', entry);

    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['run1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        {
          id: 'run1',
          type: 'priority',
          value: '',
          marks: {},
          data: { selectedValue: 'lo', selectedLabel: 'Low' },
        },
        { id: 'r2', type: 'text', value: 'second block', marks: {} },
      ],
    });
    focusRunEnd.mockClear();

    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
        <EditableBlockContent blockId="p1" runIds={['run1']} />
      </EditorProvider>,
    );
    const chip = container.querySelector('[data-run-id="run1"]');

    fireEvent.click(chip.querySelector('.be-select-trigger'));
    const highOption = [...document.querySelectorAll('.be-select-option')].find(
      (el) => el.textContent === 'High',
    );
    fireEvent.mouseDown(highOption);

    expect(store.getRun('run1').data.selectedValue).toBe('hi');
    expect(focusRunEnd).not.toHaveBeenCalled();
  });
});

describe('focusAfterChip: the underlying primitive', () => {
  it('focuses the run right after the chip in the same block', async () => {
    const { focusAfterChip } = await import('../../src/inlineTypes/shared/advanceAfterPick.js');
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        {
          id: 'p1',
          type: 'paragraph',
          parentId: 'root',
          contentIds: ['before', 'chip', 'after'],
          props: {},
        },
      ],
      runs: [
        { id: 'before', type: 'text', value: 'a', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: {} },
        { id: 'after', type: 'text', value: 'b', marks: {} },
      ],
    });
    focusRunEnd.mockClear();

    focusAfterChip(store, 'p1', 'chip');

    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith('after');
  });

  it('regression: focuses the run right after the chip in a listItem — its own runs live in props.titleRunIds, not contentIds', async () => {
    const { focusAfterChip } = await import('../../src/inlineTypes/shared/advanceAfterPick.js');
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: [], // no nested list items -- this array does NOT hold the runs
          props: { ordered: false, titleRunIds: ['before', 'chip', 'after'] },
        },
      ],
      runs: [
        { id: 'before', type: 'text', value: 'a', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: {} },
        { id: 'after', type: 'text', value: 'b', marks: {} },
      ],
    });
    focusRunEnd.mockClear();

    focusAfterChip(store, 'li1', 'chip');

    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith('after');
  });

  it('focuses the run right after the chip in a tableCell (same contentIds convention as a paragraph)', async () => {
    const { focusAfterChip } = await import('../../src/inlineTypes/shared/advanceAfterPick.js');
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['cell1'], props: {} },
        {
          id: 'cell1',
          type: 'tableCell',
          parentId: 'root',
          contentIds: ['before', 'chip', 'after'],
          props: {},
        },
      ],
      runs: [
        { id: 'before', type: 'text', value: 'a', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: {} },
        { id: 'after', type: 'text', value: 'b', marks: {} },
      ],
    });
    focusRunEnd.mockClear();

    focusAfterChip(store, 'cell1', 'chip');

    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith('after');
  });

  it('falls back to inserting and focusing a new paragraph when the chip has no trailing run', async () => {
    const { focusAfterChip } = await import('../../src/inlineTypes/shared/advanceAfterPick.js');
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['chip'], props: {} },
      ],
      runs: [{ id: 'chip', type: 'select', value: '', marks: {}, data: {} }],
    });
    focusRunEnd.mockClear();

    focusAfterChip(store, 'p1', 'chip');

    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds).toEqual(['p1', expect.any(String)]);
    const newBlockId = rootContentIds[1];
    expect(store.getBlock(newBlockId).type).toBe('paragraph');
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(store.getBlock(newBlockId).contentIds[0]);
  });
});
