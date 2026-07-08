import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

// Reproduces a user report: typing into the *last remaining* heading in a
// document (pre-filled content, heading is the sole block under root)
// accumulated a growing chain of sibling <span data-run-id> hosts, each one
// frozen at a longer prefix of the typed text, plus a final bare text node
// — instead of updating one run's value in place. Uses the *full* stack
// (BlockChildren -> BlockRenderer -> BlockErrorBoundary -> HeadingBlock),
// not a bare EditableBlockContent render, since the theory is this only
// reproduces through the whole tree.
function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 2 } },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'n', marks: {} }],
  };
}

function typeChar(editable, char) {
  const hostSpans = editable.querySelectorAll('[data-run-id]');
  const host = hostSpans[hostSpans.length - 1];
  const textNode = host.firstChild;
  textNode.data = textNode.data + char;
  fireEvent.input(editable);
}

describe('typing into the last remaining heading (real-browser regression repro)', () => {
  it('typing several characters in sequence updates one run in place, no orphaned hosts', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );

    const editable = container.querySelector('[contenteditable]');
    for (const char of 'ow ley me ') {
      typeChar(editable, char);
    }

    const hostSpans = editable.querySelectorAll('[data-run-id]');
    expect(hostSpans.length).toBe(1); // exactly one host, not one per keystroke

    const contentIds = store.getBlock('h1').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getRun(contentIds[0]).value).toBe('now ley me ');
    expect(editable.textContent).toBe('now ley me ');
  });
});
