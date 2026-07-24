import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { captureBlockTemplate, insertBlockTemplate, applyDocumentTemplate, registerBlockTemplates } from '../../src/templates/blockTemplates.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useSlashMenuTrigger } from '../../src/commands/useSlashMenuTrigger.js';
import { SlashMenu } from '../../src/commands/SlashMenu.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'li1', 'li2', 'p1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh1'], props: { level: 2 } },
      { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['rli1'] } },
      { id: 'li2', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['rli2'] } },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
    ],
    runs: [
      { id: 'rh1', type: 'text', value: 'Agenda', marks: {} },
      { id: 'rli1', type: 'text', value: 'Item one', marks: {} },
      { id: 'rli2', type: 'text', value: 'Item two', marks: {} },
      { id: 'rp1', type: 'text', value: 'notes go here', marks: {} },
    ],
  };
}

describe('captureBlockTemplate / insertBlockTemplate', () => {
  it('captures multiple sibling roots (with their own runs) in order, keeping original ids', () => {
    const store = new EditorStore(makeDoc());
    const template = captureBlockTemplate(store, ['h1', 'li1', 'li2']);

    expect(template.roots).toHaveLength(3);
    expect(template.roots.map((r) => r.rootId)).toEqual(['h1', 'li1', 'li2']);
    expect(template.roots[0].blocks[0].id).toBe('h1');
    expect(template.roots[0].runs[0].value).toBe('Agenda');
  });

  it('inserts a captured template as fresh-id siblings at the given position, leaving the source blocks untouched', () => {
    const store = new EditorStore(makeDoc());
    const template = captureBlockTemplate(store, ['h1', 'li1', 'li2']);

    insertBlockTemplate(store, template, { parentId: 'root', index: 4 }); // after p1

    const root = store.getBlock('root');
    expect(root.contentIds).toHaveLength(7); // 4 original + 3 inserted
    const insertedIds = root.contentIds.slice(4);

    // fresh ids -- none collide with the originals
    expect(insertedIds).not.toContain('h1');
    expect(insertedIds).not.toContain('li1');
    expect(insertedIds).not.toContain('li2');

    // content + order preserved
    expect(store.getBlock(insertedIds[0]).type).toBe('heading');
    expect(store.getRun(store.getBlock(insertedIds[0]).contentIds[0]).value).toBe('Agenda');
    expect(store.getBlock(insertedIds[1]).type).toBe('listItem');
    expect(store.getRun(store.getBlock(insertedIds[1]).props.titleRunIds[0]).value).toBe('Item one');
    expect(store.getBlock(insertedIds[2]).type).toBe('listItem');
    expect(store.getRun(store.getBlock(insertedIds[2]).props.titleRunIds[0]).value).toBe('Item two');

    // the original blocks are untouched
    expect(store.getBlock('h1')).toBeDefined();
    expect(store.getRun('rh1').value).toBe('Agenda');
  });

  it('inserting the same template twice never collides -- each insertion gets its own fresh ids', () => {
    const store = new EditorStore(makeDoc());
    const template = captureBlockTemplate(store, ['h1']);

    insertBlockTemplate(store, template, { parentId: 'root', index: 4 });
    insertBlockTemplate(store, template, { parentId: 'root', index: 5 });

    const root = store.getBlock('root');
    const insertedIds = root.contentIds.slice(4);
    expect(insertedIds).toHaveLength(2);
    expect(insertedIds[0]).not.toBe(insertedIds[1]);
    expect(store.getBlock(insertedIds[0]).type).toBe('heading');
    expect(store.getBlock(insertedIds[1]).type).toBe('heading');
  });

  it('inserting a subtree with descendants (not just leaf runs) remaps every level', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['callout1'], props: {} },
        { id: 'callout1', type: 'callout', parentId: 'root', contentIds: ['inner1'], props: {} },
        { id: 'inner1', type: 'paragraph', parentId: 'callout1', contentIds: ['rInner1'], props: {} },
      ],
      runs: [{ id: 'rInner1', type: 'text', value: 'nested text', marks: {} }],
    };
    const store = new EditorStore(doc);
    const template = captureBlockTemplate(store, ['callout1']);

    insertBlockTemplate(store, template, { parentId: 'root', index: 1 });

    const root = store.getBlock('root');
    expect(root.contentIds).toHaveLength(2);
    const newCalloutId = root.contentIds[1];
    expect(newCalloutId).not.toBe('callout1');
    const newCallout = store.getBlock(newCalloutId);
    expect(newCallout.contentIds).toHaveLength(1);
    const newInnerId = newCallout.contentIds[0];
    expect(newInnerId).not.toBe('inner1');
    const newInner = store.getBlock(newInnerId);
    expect(newInner.parentId).toBe(newCalloutId);
    expect(store.getRun(newInner.contentIds[0]).value).toBe('nested text');
  });

  it('batches as one undo step when the store is a History instance', () => {
    const store = new History(new EditorStore(makeDoc()));
    const template = captureBlockTemplate(store, ['h1', 'li1']);

    insertBlockTemplate(store, template, { parentId: 'root', index: 4 });
    expect(store.getBlock('root').contentIds).toHaveLength(6);

    store.undo();
    expect(store.getBlock('root').contentIds).toHaveLength(4); // both inserted blocks gone in one undo
  });
});

describe('applyDocumentTemplate', () => {
  it('wholesale-replaces an already-mounted store\'s content', () => {
    const store = new EditorStore(makeDoc());
    const templateDoc = {
      rootId: 'newRoot',
      blocks: [
        { id: 'newRoot', type: 'page', parentId: null, contentIds: ['newP'], props: {} },
        { id: 'newP', type: 'paragraph', parentId: 'newRoot', contentIds: ['newR'], props: {} },
      ],
      runs: [{ id: 'newR', type: 'text', value: 'from template', marks: {} }],
    };

    applyDocumentTemplate(store, templateDoc);

    expect(store.getRootId()).toBe('newRoot');
    expect(store.getBlock('h1')).toBeUndefined(); // old content gone
    expect(store.getRun('newR').value).toBe('from template');
  });

  it('works through a History wrapper (unwraps to the underlying EditorStore)', () => {
    const store = new History(new EditorStore(makeDoc()));
    const templateDoc = { rootId: 'r2', blocks: [{ id: 'r2', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };

    applyDocumentTemplate(store, templateDoc);

    expect(store.getRootId()).toBe('r2');
  });
});

function SlashHarness() {
  const containerRef = useRef(null);
  const { isOpen, rect, commands, runId, selectCommand, close } = useSlashMenuTrigger(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
      <SlashMenu isOpen={isOpen} rect={rect} commands={commands} runId={runId} onSelect={selectCommand} onClose={close} />
    </div>
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

describe('registerBlockTemplates: discoverable and insertable via "/", no SlashMenu changes needed', () => {
  function emptyDoc() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    };
  }

  function renderWithTemplate(store) {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const sourceStore = new EditorStore(makeDoc());
    const template = captureBlockTemplate(sourceStore, ['h1', 'li1', 'li2']);
    registerBlockTemplates(registry, [{ id: 'meeting-notes', label: 'Meeting notes', keywords: ['meeting'], roots: template.roots }]);

    return render(
      <EditorProvider store={store} registry={registry}>
        <SlashHarness />
      </EditorProvider>,
    );
  }

  it('shows up in the "/" menu by its label/keywords', () => {
    const store = new EditorStore(emptyDoc());
    const { container } = renderWithTemplate(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/meeting');
    const items = [...container.querySelectorAll('.be-slash-menu-item')];
    expect(items.map((el) => el.querySelector('.be-slash-menu-item-label').textContent)).toEqual(['Meeting notes']);
  });

  it('selecting it clears the "/query" text and inserts the captured blocks as real, rendered siblings', () => {
    const store = new EditorStore(emptyDoc());
    const { container } = renderWithTemplate(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/meeting');
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));

    // triggering run's own text is cleared, not left with "/meeting"
    expect(store.getRun('r1').value).toBe('');

    const root = store.getBlock('root');
    expect(root.contentIds).toHaveLength(4); // p1 + 3 inserted roots
    expect(store.getBlock(root.contentIds[1]).type).toBe('heading');
    expect(store.getBlock(root.contentIds[2]).type).toBe('listItem');
    expect(store.getBlock(root.contentIds[3]).type).toBe('listItem');
    // and actually rendered, not just present in the store
    expect(container.textContent).toContain('Agenda');
    expect(container.textContent).toContain('Item one');
    expect(container.textContent).toContain('Item two');
  });
});
