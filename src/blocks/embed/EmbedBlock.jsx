import { useCallback, useState } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { updateBlockProps } from '../../store/operations.js';
import { PaperclipIcon } from '../../react/icons.jsx';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const KIND_LABEL = { image: 'image', video: 'video', audio: 'audio', file: 'file' };
const KIND_ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '*/*' };

function EmbedPreview({ kind, src, name }) {
  if (kind === 'image') return <img className="be-embed-image" src={src} alt={name || ''} />;
  if (kind === 'video') return <video className="be-embed-video" src={src} controls />;
  if (kind === 'audio') return <audio className="be-embed-audio" src={src} controls />;
  return (
    <a className="be-embed-file-link" href={src} download={name || undefined} target="_blank" rel="noopener noreferrer">
      <PaperclipIcon size={14} /> {name || src}
    </a>
  );
}

/**
 * A pure "widget" block — no runs/text at all (contentIds always []), same
 * shape as DividerBlock — so it participates in cross-block select/copy/
 * cut/delete for free via the exact same generic mechanisms already
 * exercised by divider: it's "contentless" the same way, so backspacing
 * into it from a following block clears it as the nearest obstacle,
 * matching every other contentless block (see mergeWithPreviousOrDelete).
 *
 * There is no upload-to-a-server endpoint here — this is a zero-runtime-
 * dependency package with no backend component at all — so a local file
 * picked via the file input or dropped is read via FileReader straight
 * into a data: URL and stored directly in props.src. That keeps the
 * document fully self-contained (works offline, round-trips through copy/
 * paste and undo/redo like any other prop) at the cost of bloating the
 * document for large media; a host app that wants real upload-to-a-server
 * behavior should intercept this at a higher level (e.g. wrapping
 * createEmbedBlock/this component with its own), which is as far as a
 * dependency-free package can reasonably go on its own.
 */
export function EmbedBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const [urlInput, setUrlInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const setMedia = useCallback((patch) => store.applyOperation(updateBlockProps(id, patch)), [store, id]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const src = await readFileAsDataURL(file);
      setMedia({ src, name: file.name, mimeType: file.type });
    },
    [setMedia],
  );

  const handleDrop = useCallback(
    async (event) => {
      event.preventDefault();
      setIsDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      const src = await readFileAsDataURL(file);
      setMedia({ src, name: file.name, mimeType: file.type });
    },
    [setMedia],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const commitUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setMedia({ src: trimmed, name: trimmed });
    setUrlInput('');
  }, [urlInput, setMedia]);

  const clearMedia = useCallback(() => setMedia({ src: '', name: '', mimeType: '' }), [setMedia]);

  if (!block) return null;
  const { kind = 'file', src, name } = block.props;

  return (
    // tabIndex={-1}: focusable via .focus() (see setSelectedBlockId in
    // EditorProvider.jsx) without joining the normal Tab order — keeps the
    // surface's keydown listener capturing subsequent Backspace/Delete
    // presses once this block becomes selected, even when whatever
    // previously had focus was just removed from the DOM entirely.
    <div className="be-embed" data-block-id={id} data-kind={kind} contentEditable={false} tabIndex={-1}>
      {src ? (
        <div className="be-embed-preview">
          <EmbedPreview kind={kind} src={src} name={name} />
          <button type="button" className="be-embed-remove" onClick={clearMedia} aria-label={`Remove ${KIND_LABEL[kind]}`}>
            Remove
          </button>
        </div>
      ) : (
        <div
          className={`be-embed-dropzone${isDragOver ? ' be-embed-dropzone-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <label className="be-embed-upload-btn">
            Upload {KIND_LABEL[kind]}
            <input type="file" accept={KIND_ACCEPT[kind]} onChange={handleFileChange} hidden />
          </label>
          <span className="be-embed-dropzone-hint">or drop a file, or paste a URL below</span>
          <div className="be-embed-url-row">
            <input
              type="text"
              className="be-embed-url-input"
              placeholder={`https://... ${KIND_LABEL[kind]} URL`}
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && commitUrl()}
            />
            <button type="button" className="be-embed-url-commit" onClick={commitUrl}>
              Embed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
