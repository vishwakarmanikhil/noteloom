import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { DocumentExportButton } from '../../src/react/DocumentExportButton.jsx';

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

function renderHarness() {
  const store = new EditorStore(makeDoc());
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <DocumentExportButton />
    </EditorProvider>,
  );
}

describe('DocumentExportButton: Simple JSON tab', () => {
  it('offers a "Simple JSON" tab alongside JSON/HTML/Markdown/Text', () => {
    const { getByText } = renderHarness();
    fireEvent.click(getByText('View source'));

    expect(getByText('JSON')).not.toBeNull();
    expect(getByText('Simple JSON')).not.toBeNull();
    expect(getByText('HTML')).not.toBeNull();
    expect(getByText('Markdown')).not.toBeNull();
    expect(getByText('Text')).not.toBeNull();
  });

  it('switching to "Simple JSON" shows the flatter self-contained-block shape, not the raw internal {blocks, runs} shape', () => {
    const { getByText, container } = renderHarness();
    fireEvent.click(getByText('View source'));
    fireEvent.click(getByText('Simple JSON'));

    const content = container.querySelector('.be-export-pre code').textContent;
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.blocks).toEqual([{ id: 'p1', type: 'paragraph', data: { text: 'hello' } }]);
  });

  it('switching to "Markdown" shows the document rendered as Markdown', () => {
    const { getByText, container } = renderHarness();
    fireEvent.click(getByText('View source'));
    fireEvent.click(getByText('Markdown'));

    expect(container.querySelector('.be-export-pre code').textContent).toBe('hello');
  });
});

describe('DocumentExportButton: Print / Save as PDF and Download Word (.doc)', () => {
  it('"Print / Save as PDF" calls window.print()', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { getByText } = renderHarness();
    fireEvent.click(getByText('View source'));
    fireEvent.click(getByText('Print / Save as PDF'));

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('"Download Word (.doc)" creates a temporary <a download="document.doc"> with a Word-flavored data: URL and clicks it', () => {
    const { getByText, container } = renderHarness();
    fireEvent.click(getByText('View source'));

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(getByText('Download Word (.doc)'));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // the anchor is removed again immediately after triggering the download
    expect(container.ownerDocument.querySelector('a[download="document.doc"]')).toBeNull();
    clickSpy.mockRestore();
  });
});
