import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['div1', 'todo1'], props: {} },
      { id: 'div1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
      {
        id: 'todo1',
        type: 'listItem',
        parentId: 'root',
        contentIds: [],
        props: { ordered: false, checked: false, titleRunIds: ['r1'] },
      },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'buy milk', marks: {} }],
  };
}

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('divider block', () => {
  it('renders an <hr> and is registered for the slash menu', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    expect(container.querySelector('hr.be-divider')).not.toBeNull();

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    expect(registry.listSlashCommands().some((c) => c.label === 'Divider')).toBe(true);
  });
});

describe('checkbox (to-do) list item', () => {
  it('renders a checkbox instead of a bullet when props.checked is defined', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const checkbox = container.querySelector('input.be-list-checkbox');
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
    expect(container.querySelector('.be-list-marker')).toBeNull(); // no bullet for todo items
  });

  it('toggling the checkbox updates props.checked in the store', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const checkbox = container.querySelector('input.be-list-checkbox');
    fireEvent.click(checkbox);

    expect(store.getBlock('todo1').props.checked).toBe(true);
  });

  it('the registry offers three distinct list slash commands from one type', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const labels = registry.listSlashCommands().map((c) => c.label);
    expect(labels).toContain('Bulleted list');
    expect(labels).toContain('Numbered list');
    expect(labels).toContain('To-do list');
  });
});
