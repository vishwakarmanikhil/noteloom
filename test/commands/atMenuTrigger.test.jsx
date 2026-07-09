import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { createSelectFieldType } from '../../src/inlineTypes/customSelect/createSelectFieldType.jsx';
import { useAtMenuTrigger } from '../../src/commands/useAtMenuTrigger.js';
import { SlashMenu } from '../../src/commands/SlashMenu.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
  };
}

function Harness() {
  const containerRef = useRef(null);
  const { isOpen, rect, commands, runId, selectCommand, close } = useAtMenuTrigger(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
      <SlashMenu isOpen={isOpen} rect={rect} commands={commands} runId={runId} onSelect={selectCommand} onClose={close} menuId="be-at-menu" ariaLabel="Mention" />
    </div>
  );
}

function renderHarness(store, inlineRegistry) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry}>
      <Harness />
    </EditorProvider>,
  );
}

function typeIntoRun(runNode, text) {
  runNode.textContent = text;
  const range = document.createRange();
  range.setStart(runNode.firstChild, text.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(runNode);
}

describe('"@" trigger menu: only lists types that opted in via atCommand/atCommands', () => {
  it('a slash-only field type (default triggers) does NOT show up under "@"', () => {
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register('priority', createSelectFieldType({ type: 'priority', label: 'Priority', options: [] }));
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, inlineRegistry);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '@');
    expect(container.querySelectorAll('.be-slash-menu-item').length).toBe(0);
  });

  it('a field type registered with triggers: ["slash", "at"] shows up under "@" (and still under "/")', () => {
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register(
      'assignee',
      createSelectFieldType({ type: 'assignee', label: 'Assignee', options: [{ value: 'u1', label: 'Alex' }], triggers: ['slash', 'at'] }),
    );
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, inlineRegistry);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '@');
    const items = [...container.querySelectorAll('.be-slash-menu-item')];
    expect(items.some((el) => el.textContent === 'Assignee')).toBe(true);

    expect(inlineRegistry.get('assignee').slashCommand).toBeDefined();
    expect(inlineRegistry.get('assignee').atCommand).toBeDefined();
  });

  it('an "at"-only field type shows under "@" but not "/"', () => {
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register('assignee', createSelectFieldType({ type: 'assignee', label: 'Assignee', options: [], triggers: ['at'] }));

    expect(inlineRegistry.listSlashCommands()).toEqual([]);
    expect(inlineRegistry.listAtCommands().map((c) => c.label)).toEqual(['Assignee']);
  });

  it('selecting an "@" command splices the chip in exactly like a "/" command does', () => {
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register(
      'assignee',
      createSelectFieldType({ type: 'assignee', label: 'Assignee', options: [], triggers: ['at'] }),
    );
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, inlineRegistry);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'ping @');
    const item = container.querySelector('.be-slash-menu-item');
    fireEvent.mouseDown(item);

    expect(store.getBlock('root').contentIds).toEqual(['p1']); // spliced inline, no new block
    const p1 = store.getBlock('p1');
    const [beforeId, chipId] = p1.contentIds;
    expect(store.getRun(beforeId).value).toBe('ping ');
    expect(store.getRun(chipId).type).toBe('assignee');
  });

  it('does not trigger when "@" is not at a word boundary', () => {
    const inlineRegistry = createInlineRegistry();
    inlineRegistry.register('assignee', createSelectFieldType({ type: 'assignee', label: 'Assignee', options: [], triggers: ['at'] }));
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, inlineRegistry);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'a@b');
    expect(container.querySelectorAll('.be-slash-menu-item').length).toBe(0);
  });
});
