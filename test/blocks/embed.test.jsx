import { describe, it, expect } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock } from '../../src/store/operations.js';
import { createEmbedBlock } from '../../src/blocks/embed/createEmbedBlock.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory, index = 0) {
  const { block, runs = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block], runs }));
  return block.id;
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

describe('embed block: rendering per kind', () => {
  it('shows an upload/URL dropzone when no src is set yet', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image' }));
    const { container } = renderDoc(store);

    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    expect(wrapper.getAttribute('data-kind')).toBe('image');
    expect(wrapper.querySelector('.be-embed-dropzone')).not.toBeNull();
    expect(wrapper.querySelector('img')).toBeNull();
  });

  it('renders an <img> once src is set (image kind)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://example.com/cat.png', name: 'cat' }));
    const { container } = renderDoc(store);

    const img = container.querySelector(`[data-block-id="${id}"] img.be-embed-image`);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/cat.png');
    expect(img.getAttribute('alt')).toBe('cat');
  });

  it('renders a <video> with controls (video kind)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'video', src: 'https://example.com/clip.mp4' }));
    const { container } = renderDoc(store);
    const video = container.querySelector(`[data-block-id="${id}"] video.be-embed-video`);
    expect(video).not.toBeNull();
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('renders an <audio> with controls (audio kind)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'audio', src: 'https://example.com/track.mp3' }));
    const { container } = renderDoc(store);
    expect(container.querySelector(`[data-block-id="${id}"] audio.be-embed-audio`)).not.toBeNull();
  });

  it('renders a download link (file kind)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'file', src: 'https://example.com/report.pdf', name: 'report.pdf' }));
    const { container } = renderDoc(store);
    const link = container.querySelector(`[data-block-id="${id}"] a.be-embed-file-link`);
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('report.pdf');
  });
});

describe('embed block: pasting a URL', () => {
  it('typing a URL and clicking Embed sets props.src/name', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'video' }));
    const { container } = renderDoc(store);

    const input = container.querySelector(`[data-block-id="${id}"] .be-embed-url-input`);
    fireEvent.change(input, { target: { value: 'https://example.com/movie.mp4' } });
    fireEvent.click(container.querySelector(`[data-block-id="${id}"] .be-embed-url-commit`));

    expect(store.getBlock(id).props.src).toBe('https://example.com/movie.mp4');
  });

  it('pressing Enter in the URL input also commits it', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'audio' }));
    const { container } = renderDoc(store);

    const input = container.querySelector(`[data-block-id="${id}"] .be-embed-url-input`);
    fireEvent.change(input, { target: { value: 'https://example.com/song.mp3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(store.getBlock(id).props.src).toBe('https://example.com/song.mp3');
  });

  it('a blank URL does nothing', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'file' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector(`[data-block-id="${id}"] .be-embed-url-commit`));
    expect(store.getBlock(id).props.src).toBe('');
  });
});

describe('embed block: uploading a local file reads it into a data: URL (no backend needed)', () => {
  it('picking a file via the hidden file input sets props.src to a data URL and props.name to the filename', async () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image' }));
    const { container } = renderDoc(store);

    const file = new File(['fake-image-bytes'], 'photo.png', { type: 'image/png' });
    const fileInput = container.querySelector(`[data-block-id="${id}"] input[type="file"]`);
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(store.getBlock(id).props.src).toMatch(/^data:image\/png/));
    expect(store.getBlock(id).props.name).toBe('photo.png');
    expect(store.getBlock(id).props.mimeType).toBe('image/png');
  });

  it('dropping a file onto the dropzone does the same thing', async () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'file' }));
    const { container } = renderDoc(store);

    const file = new File(['fake-pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });
    const dropzone = container.querySelector(`[data-block-id="${id}"] .be-embed-dropzone`);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(store.getBlock(id).props.src).toMatch(/^data:application\/pdf/));
    expect(store.getBlock(id).props.name).toBe('doc.pdf');
  });
});

describe('embed block: removing clears props back to the dropzone state', () => {
  it('clicking Remove resets src/name/mimeType', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://example.com/x.png', name: 'x.png' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector(`[data-block-id="${id}"] .be-embed-remove`));

    const block = store.getBlock(id);
    expect(block.props.src).toBe('');
    expect(block.props.name).toBe('');
    expect(container.querySelector(`[data-block-id="${id}"] .be-embed-dropzone`)).not.toBeNull();
  });
});

describe('embed block: contentless, same as divider (no runs at all)', () => {
  it('backspacing into it from a following block clears it as the nearest obstacle', () => {
    const store = new EditorStore(emptyDoc());
    const embedId = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://example.com/x.png' }));
    const afterId = insertAtRoot(
      store,
      () => ({
        block: { id: 'after', type: 'paragraph', parentId: 'root', contentIds: ['r-after'], props: {} },
        runs: [{ id: 'r-after', type: 'text', value: 'after', marks: {} }],
      }),
      1,
    );

    const result = mergeWithPreviousOrDelete(store, afterId);

    expect(result).toBe(afterId); // stayed put — the obstacle (embed) is what got removed
    expect(store.getBlock(embedId)).toBeUndefined();
    expect(store.getBlock(afterId)).toBeDefined();
    expect(store.getRun('r-after').value).toBe('after'); // untouched
  });
});

describe('embed block: clipboard round-trip', () => {
  it('toHTML emits the right tag per kind', () => {
    const store = new EditorStore(emptyDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const img = createEmbedBlock({ kind: 'image', src: 'https://x/a.png', name: 'a' })('root').block;
    expect(registry.get('embed').toHTML(img)).toBe('<img src="https://x/a.png" alt="a">');

    const vid = createEmbedBlock({ kind: 'video', src: 'https://x/a.mp4' })('root').block;
    expect(registry.get('embed').toHTML(vid)).toBe('<video src="https://x/a.mp4" controls></video>');

    const aud = createEmbedBlock({ kind: 'audio', src: 'https://x/a.mp3' })('root').block;
    expect(registry.get('embed').toHTML(aud)).toBe('<audio src="https://x/a.mp3" controls></audio>');

    const file = createEmbedBlock({ kind: 'file', src: 'https://x/a.pdf', name: 'a.pdf' })('root').block;
    expect(registry.get('embed').toHTML(file)).toBe('<a class="be-embed-file-link" href="https://x/a.pdf">a.pdf</a>');
  });

  it('walkDomToBlocks reconstructs image/video/audio embeds from plain tags', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const [imgInsert] = walkDomToBlocks('<img src="https://x/a.png" alt="a">', registry);
    expect(imgInsert.block.type).toBe('embed');
    expect(imgInsert.block.props.kind).toBe('image');
    expect(imgInsert.block.props.src).toBe('https://x/a.png');

    const [vidInsert] = walkDomToBlocks('<video src="https://x/a.mp4"></video>', registry);
    expect(vidInsert.block.props.kind).toBe('video');

    const [audInsert] = walkDomToBlocks('<audio src="https://x/a.mp3"></audio>', registry);
    expect(audInsert.block.props.kind).toBe('audio');
  });

  it('walkDomToBlocks reconstructs a file embed only from its marker-classed <a>, not an ordinary link', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const [fileInsert] = walkDomToBlocks('<a class="be-embed-file-link" href="https://x/a.pdf">a.pdf</a>', registry);
    expect(fileInsert.block.type).toBe('embed');
    expect(fileInsert.block.props.kind).toBe('file');

    const [plainInsert] = walkDomToBlocks('<a href="https://x/a.pdf">a.pdf</a>', registry);
    expect(plainInsert.block.type).toBe('paragraph'); // ordinary link, not an embed
  });
});
