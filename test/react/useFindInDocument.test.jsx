import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useFindInDocument } from '../../src/react/useFindInDocument.js';
import { FindBar } from '../../src/react/FindBar.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'the cat sat', marks: {} },
      { id: 'r2', type: 'text', value: 'on the mat', marks: {} },
    ],
  };
}

function Harness() {
  const containerRef = useRef(null);
  const find = useFindInDocument(containerRef);
  return (
    <div ref={containerRef}>
      <FindBar {...find} />
      <BlockChildren parentId="root" />
    </div>
  );
}

function renderHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <Harness />
    </EditorProvider>,
  );
}

describe('useFindInDocument + FindBar', () => {
  it('is closed by default; Ctrl/Cmd+F while the container has focus opens it and focuses the query input', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    expect(container.querySelector('.be-find-bar')).toBeNull();

    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });

    const bar = container.querySelector('.be-find-bar');
    expect(bar).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.be-find-bar-input'));
  });

  it('typing a query shows the match count and navigating wraps around', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });

    const input = container.querySelector('.be-find-bar-input');
    fireEvent.change(input, { target: { value: 'the' } });
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/2'); // "the" appears in both paragraphs

    const [prevBtn, nextBtn] = container.querySelectorAll('.be-find-bar-nav');
    fireEvent.click(nextBtn);
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('2/2');
    fireEvent.click(nextBtn); // wraps back to the first match
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/2');
    fireEvent.click(prevBtn); // wraps backward too
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('2/2');
  });

  it('Enter/Shift+Enter in the query input also navigate next/previous', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });

    const input = container.querySelector('.be-find-bar-input');
    fireEvent.change(input, { target: { value: 'the' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('2/2');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/2');
  });

  it('caseSensitive and wholeWord toggles narrow the match set', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'Cat catalog CAT', marks: {} }],
    });
    const { container } = renderHarness(store);
    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });
    const input = container.querySelector('.be-find-bar-input');
    fireEvent.change(input, { target: { value: 'cat' } });
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/3'); // Cat, catalog's "cat", CAT

    const [caseBtn, wholeWordBtn] = container.querySelectorAll('.be-find-bar-toggle');
    fireEvent.click(wholeWordBtn);
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/2'); // excludes catalog's "cat"

    fireEvent.click(caseBtn);
    fireEvent.change(input, { target: { value: 'Cat' } });
    expect(container.querySelector('.be-find-bar-count').textContent).toBe('1/1'); // only the exact-case whole word
  });

  it('Escape in the query input closes the bar and restores focus to the previously-focused element', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });
    expect(container.querySelector('.be-find-bar')).not.toBeNull();

    fireEvent.keyDown(container.querySelector('.be-find-bar-input'), { key: 'Escape' });
    expect(container.querySelector('.be-find-bar')).toBeNull();
    expect(document.activeElement).toBe(outsideButton);

    document.body.removeChild(outsideButton);
  });

  it('"Replace" replaces just the current match; "Replace All" replaces every match', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });

    fireEvent.click(container.querySelector('.be-find-bar-replace-toggle'));
    fireEvent.change(container.querySelector('.be-find-bar-input'), { target: { value: 'the' } });

    const replaceInput = container.querySelectorAll('.be-find-bar-input')[1];
    fireEvent.change(replaceInput, { target: { value: 'THE' } });

    const [replaceBtn, replaceAllBtn] = container.querySelectorAll('.be-find-bar-replace-btn');
    fireEvent.click(replaceBtn); // replaces just the current (first) match
    expect(store.getRun('r1').value).toBe('THE cat sat');
    expect(store.getRun('r2').value).toBe('on the mat');

    fireEvent.click(replaceAllBtn); // replaces every remaining match
    expect(store.getRun('r2').value).toBe('on THE mat');
  });

  it('an atomic-undo store (History) undoes a Replace All as one step', () => {
    const store = new History(new EditorStore(makeDoc()));
    const { container } = renderHarness(store);
    fireEvent.keyDown(container.firstChild, { key: 'f', ctrlKey: true });

    fireEvent.click(container.querySelector('.be-find-bar-replace-toggle'));
    fireEvent.change(container.querySelector('.be-find-bar-input'), { target: { value: 'the' } });
    fireEvent.change(container.querySelectorAll('.be-find-bar-input')[1], {
      target: { value: 'THE' },
    });
    fireEvent.click(container.querySelectorAll('.be-find-bar-replace-btn')[1]); // Replace All

    expect(store.getRun('r1').value).toBe('THE cat sat');
    expect(store.getRun('r2').value).toBe('on THE mat');

    store.undo();
    expect(store.getRun('r1').value).toBe('the cat sat');
    expect(store.getRun('r2').value).toBe('on the mat');
  });
});
