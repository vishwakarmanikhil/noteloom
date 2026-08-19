import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { VersionHistory } from '../../src/react/VersionHistory.jsx';
import { updateRun } from '../../src/store/operations.js';

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

// The onSnapshot callback fires (and updates VersionHistory's own state)
// asynchronously via createAutoVersionHistory's idle timer -- wrapping the
// wait in act() is what tells React Testing Library that update is expected,
// instead of warning about it as if it were an untracked side effect.
const sleep = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
let docCounter = 0;
const freshDocId = () => `vh-component-doc-${docCounter++}`;

function renderPanel(history, docId, props = {}) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return render(
    <EditorProvider store={history} registry={registry} inlineRegistry={inlineRegistry} history={history}>
      <VersionHistory docId={docId} idleMs={30} {...props} />
    </EditorProvider>,
  );
}

describe('VersionHistory', () => {
  it('renders a trigger button, closed by default', () => {
    const history = new History(new EditorStore(makeDoc()));
    const { getByText } = renderPanel(history, freshDocId());
    expect(getByText('Version history')).toBeTruthy();
    expect(document.querySelector('.be-version-history-drawer')).toBeNull();
  });

  it('opens the drawer on click, showing the empty state when there are no versions yet', async () => {
    const history = new History(new EditorStore(makeDoc()));
    const { getByText } = renderPanel(history, freshDocId());

    fireEvent.click(getByText('Version history'));
    expect(await waitFor(() => getByText(/No versions yet/))).toBeTruthy();
  });

  it('lists an automatically-captured version once the idle window closes, grouped under "Today"', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const { getByText } = renderPanel(history, docId);

    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(150); // past idleMs -- a version gets auto-saved

    fireEvent.click(getByText('Version history'));
    await waitFor(() => expect(getByText('Today')).toBeTruthy());
    expect(getByText('alice')).toBeTruthy();
    expect(getByText(/block.*changed/)).toBeTruthy();
  });

  it('clicking a version shows a preview with author/summary and a Restore button', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const { getByText } = renderPanel(history, docId);

    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(150);

    fireEvent.click(getByText('Version history'));
    await waitFor(() => getByText('alice'));
    fireEvent.click(document.querySelector('.be-version-history-item'));

    expect(document.querySelector('.be-version-history-header span').textContent).toBe('Preview');
    // Defaults to the "Changes" tab -- a word-level diff against the previous version.
    expect(document.querySelector('.be-version-history-diff-body').textContent).toContain('hi');
    expect(getByText('Restore this version')).toBeTruthy();

    // Switching to the "Preview" tab shows the plain, non-diffed render instead.
    fireEvent.click(document.querySelector('.be-version-history-view-toggle button:nth-child(2)'));
    expect(document.querySelector('.be-version-history-preview-body:not(.be-version-history-diff-body)').textContent).toContain('hi');
  });

  it('restoring a version replaces the live document and closes the drawer', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const { getByText } = renderPanel(history, docId);

    history.perform(updateRun('r1', { value: 'captured version' }));
    await sleep(150);
    history.perform(updateRun('r1', { value: 'edited after the snapshot' })); // live doc now differs from the saved version

    fireEvent.click(getByText('Version history'));
    await waitFor(() => getByText('alice'));
    fireEvent.click(document.querySelector('.be-version-history-item'));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(getByText('Restore this version'));
    confirmSpy.mockRestore();

    expect(history.getRun('r1').value).toBe('captured version');
    expect(document.querySelector('.be-version-history-drawer')).toBeNull();
  });

  it('closes on Escape', async () => {
    const history = new History(new EditorStore(makeDoc()));
    const { getByText } = renderPanel(history, freshDocId());

    fireEvent.click(getByText('Version history'));
    expect(document.querySelector('.be-version-history-drawer')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.be-version-history-drawer')).toBeNull();
  });

  it('is aria-modal, moves focus in on open, and restores it to the trigger on close', () => {
    const history = new History(new EditorStore(makeDoc()));
    const { getByText } = renderPanel(history, freshDocId());

    const trigger = getByText('Version history').closest('button');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const drawer = document.querySelector('.be-version-history-drawer');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.be-version-history-drawer')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
