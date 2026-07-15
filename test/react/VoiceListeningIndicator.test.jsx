import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { VoiceListeningIndicator } from '../../src/react/VoiceListeningIndicator.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
  };
}

function selectCollapsedAt(runNode, offset) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
}

function renderHarness(store, voice) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
      <VoiceListeningIndicator voice={voice} />
    </EditorProvider>,
  );
}

describe('VoiceListeningIndicator', () => {
  it('renders nothing when not listening', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, { isListening: false, status: 'idle' });
    expect(document.querySelector('.be-voice-indicator')).toBeNull();
  });

  it('renders nothing when there is no voice prop at all', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, undefined);
    expect(document.querySelector('.be-voice-indicator')).toBeNull();
  });

  it('renders the "Listening…" badge once listening and a caret exists', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { isListening: true, status: 'listening' });
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);

    const badge = document.querySelector('.be-voice-indicator');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Listening…');
    expect(badge.classList.contains('be-voice-indicator-processing')).toBe(false);
  });

  it('shows "Processing…" and the processing style when status is "processing"', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { isListening: true, status: 'processing' });
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);

    const badge = document.querySelector('.be-voice-indicator');
    expect(badge.textContent).toContain('Processing…');
    expect(badge.classList.contains('be-voice-indicator-processing')).toBe(true);
  });

  it('does not render until there is a resolvable caret, even while listening', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, { isListening: true, status: 'listening' });
    // No selection ever made inside a run in this test.
    expect(document.querySelector('.be-voice-indicator')).toBeNull();
  });

  it('disappears once isListening goes back to false', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    function Wrapper({ listening }) {
      return (
        <EditorProvider store={store} registry={registry}>
          <BlockChildren parentId="root" />
          <VoiceListeningIndicator voice={{ isListening: listening, status: 'listening' }} />
        </EditorProvider>
      );
    }

    const { container, rerender } = render(<Wrapper listening />);
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 2);
    expect(document.querySelector('.be-voice-indicator')).not.toBeNull();

    rerender(<Wrapper listening={false} />);
    expect(document.querySelector('.be-voice-indicator')).toBeNull();
  });
});
