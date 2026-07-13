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
    // alt is deliberately NOT the filename/name — a raw filename isn't
    // meaningful alt text, so it stays empty until the user sets a real
    // description via the "Alt text" button (see the next test).
    expect(img.getAttribute('alt')).toBe('');
  });

  it('sets a real, distinct alt text via the "Alt text" button, never falling back to the filename', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://example.com/cat.png', name: 'cat.png' }));
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    fireEvent.click(wrapper.querySelector('.be-embed-alt-text-btn'));
    const input = document.querySelector('.be-modal input[type="text"]');
    fireEvent.change(input, { target: { value: 'A sleeping orange cat' } });
    fireEvent.submit(input.closest('form'));

    expect(store.getBlock(id).props.alt).toBe('A sleeping orange cat');
    const img = wrapper.querySelector('img.be-embed-image');
    expect(img.getAttribute('alt')).toBe('A sleeping orange cat');
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

describe('embed block: alignment toolbar', () => {
  it('defaults to left-aligned, full width', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://x/a.png' }));
    expect(store.getBlock(id).props.align).toBe('left');
    expect(store.getBlock(id).props.width).toBe(100);
  });

  it('clicking center/right updates props.align, and the active button reflects it', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://x/a.png' }));
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    fireEvent.click(wrapper.querySelector('[aria-label="Align center"]'));
    expect(store.getBlock(id).props.align).toBe('center');
    expect(wrapper.querySelector('[aria-label="Align center"]').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(wrapper.querySelector('[aria-label="Align right"]'));
    expect(store.getBlock(id).props.align).toBe('right');
  });

  it('the alignment toolbar is available for every kind, including audio/file', () => {
    const store = new EditorStore(emptyDoc());
    const audioId = insertAtRoot(store, createEmbedBlock({ kind: 'audio', src: 'https://x/a.mp3' }), 0);
    const fileId = insertAtRoot(store, createEmbedBlock({ kind: 'file', src: 'https://x/a.pdf', name: 'a.pdf' }), 1);
    const { container } = renderDoc(store);

    expect(container.querySelector(`[data-block-id="${audioId}"] [aria-label="Align center"]`)).not.toBeNull();
    expect(container.querySelector(`[data-block-id="${fileId}"] [aria-label="Align center"]`)).not.toBeNull();
  });
});

describe('embed block: resize handle (image/video only)', () => {
  function stubRect(el, width) {
    el.getBoundingClientRect = () => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 });
  }

  it('only image/video kinds render a resize handle — audio/file do not', () => {
    const store = new EditorStore(emptyDoc());
    const imgId = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://x/a.png' }), 0);
    const audioId = insertAtRoot(store, createEmbedBlock({ kind: 'audio', src: 'https://x/a.mp3' }), 1);
    const fileId = insertAtRoot(store, createEmbedBlock({ kind: 'file', src: 'https://x/a.pdf', name: 'a.pdf' }), 2);
    const { container } = renderDoc(store);

    expect(container.querySelector(`[data-block-id="${imgId}"] .be-embed-resize-handle`)).not.toBeNull();
    expect(container.querySelector(`[data-block-id="${audioId}"] .be-embed-resize-handle`)).toBeNull();
    expect(container.querySelector(`[data-block-id="${fileId}"] .be-embed-resize-handle`)).toBeNull();
  });

  it('dragging the handle updates props.width once, on mouseup (not on every mousemove)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://x/a.png' }));
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    const preview = wrapper.querySelector('.be-embed-preview');
    const frame = wrapper.querySelector('.be-embed-frame');
    const handle = wrapper.querySelector('.be-embed-resize-handle');

    stubRect(preview, 400); // container is 400px wide
    stubRect(frame, 400); // frame starts at full (100%) width

    fireEvent.mouseDown(handle, { clientX: 400 });
    expect(store.getBlock(id).props.width).toBe(100); // no store write yet, just from mousedown

    fireEvent.mouseMove(document, { clientX: 200 }); // dragged 200px left: (400-200)/400 = 50%
    expect(store.getBlock(id).props.width).toBe(100); // still not written — only local preview state changes

    fireEvent.mouseUp(document, { clientX: 200 });
    expect(store.getBlock(id).props.width).toBe(50);
  });

  it('clamps the dragged width between 20% and 100%', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createEmbedBlock({ kind: 'image', src: 'https://x/a.png' }));
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    const preview = wrapper.querySelector('.be-embed-preview');
    const frame = wrapper.querySelector('.be-embed-frame');
    const handle = wrapper.querySelector('.be-embed-resize-handle');

    stubRect(preview, 400);
    stubRect(frame, 400);

    fireEvent.mouseDown(handle, { clientX: 400 });
    fireEvent.mouseUp(document, { clientX: -1000 }); // way past the left edge
    expect(store.getBlock(id).props.width).toBe(20);
  });
});

describe('embed block: clipboard round-trip', () => {
  it('toHTML emits the right tag per kind', () => {
    const store = new EditorStore(emptyDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const img = createEmbedBlock({ kind: 'image', src: 'https://x/a.png', alt: 'a' })('root').block;
    expect(registry.get('embed').toHTML(img)).toBe('<img src="https://x/a.png" alt="a">');

    const vid = createEmbedBlock({ kind: 'video', src: 'https://x/a.mp4' })('root').block;
    expect(registry.get('embed').toHTML(vid)).toBe('<video src="https://x/a.mp4" controls></video>');

    const aud = createEmbedBlock({ kind: 'audio', src: 'https://x/a.mp3' })('root').block;
    expect(registry.get('embed').toHTML(aud)).toBe('<audio src="https://x/a.mp3" controls></audio>');

    const file = createEmbedBlock({ kind: 'file', src: 'https://x/a.pdf', name: 'a.pdf' })('root').block;
    expect(registry.get('embed').toHTML(file)).toBe('<a class="be-embed-file-link" href="https://x/a.pdf">a.pdf</a>');
  });

  it('non-default align/width are emitted as an inline style on image/video only', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const resized = createEmbedBlock({ kind: 'image', src: 'https://x/a.png', width: 60 })('root').block;
    expect(registry.get('embed').toHTML(resized)).toBe('<img src="https://x/a.png" alt="" style="width:60%">');

    const centered = createEmbedBlock({ kind: 'video', src: 'https://x/a.mp4', align: 'center' })('root').block;
    expect(registry.get('embed').toHTML(centered)).toBe(
      '<video src="https://x/a.mp4" controls style="display:block;margin-left:auto;margin-right:auto"></video>',
    );

    // audio has no visual width concept, so align/width never affect its HTML
    const audio = createEmbedBlock({ kind: 'audio', src: 'https://x/a.mp3', align: 'center', width: 50 })('root').block;
    expect(registry.get('embed').toHTML(audio)).toBe('<audio src="https://x/a.mp3" controls></audio>');
  });

  it('walkDomToBlocks parses width/align back out of the inline style', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const [resized] = walkDomToBlocks('<img src="https://x/a.png" style="width:60%">', registry);
    expect(resized.block.props.width).toBe(60);
    expect(resized.block.props.align).toBe('left');

    const [rightAligned] = walkDomToBlocks(
      '<video src="https://x/a.mp4" style="display:block;margin-left:auto"></video>',
      registry,
    );
    expect(rightAligned.block.props.align).toBe('right');

    const [plain] = walkDomToBlocks('<img src="https://x/a.png">', registry);
    expect(plain.block.props.align).toBe('left');
    expect(plain.block.props.width).toBe(100);
  });

  it('walkDomToBlocks reconstructs image/video/audio embeds from plain tags', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const [imgInsert] = walkDomToBlocks('<img src="https://x/a.png" alt="a">', registry);
    expect(imgInsert.block.type).toBe('embed');
    expect(imgInsert.block.props.kind).toBe('image');
    expect(imgInsert.block.props.src).toBe('https://x/a.png');
    // The pasted <img>'s real alt lands in props.alt, kept separate from
    // `name` (no meaningful "filename" concept for an externally pasted image).
    expect(imgInsert.block.props.alt).toBe('a');
    expect(imgInsert.block.props.name).toBe('');

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
