import { useCallback, useRef, useState } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName } from '../../react/EditorProvider.jsx';
import { updateBlockProps } from '../../store/operations.js';
import { Modal } from '../../react/Modal.jsx';
import { PaperclipIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon } from '../../react/icons.jsx';

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
const MIN_WIDTH = 20;
const MAX_WIDTH = 100;
const ALIGN_OPTIONS = [
  { value: 'left', Icon: AlignLeftIcon, label: 'Align left' },
  { value: 'center', Icon: AlignCenterIcon, label: 'Align center' },
  { value: 'right', Icon: AlignRightIcon, label: 'Align right' },
];

function clampWidth(pct) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(pct)));
}

function EmbedPreview({ kind, src, name, alt }) {
  // Deliberately never falls back to `name` (the uploaded file's raw
  // filename, e.g. "IMG_2481.HEIC", or a pasted URL string) — neither is
  // meaningful alt text, and silently presenting one as if it were a real
  // description is worse than an empty (but at least honest) alt.
  if (kind === 'image') return <img className="be-embed-image" src={src} alt={alt || ''} />;
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
 *
 * `align` positions the whole widget within the line (a flex row on
 * `.be-embed-preview`, a common media alignment pattern). `width` is a
 * percentage, dragged via `.be-embed-resize-handle` — only image/video
 * kinds get the handle (an audio player or a file-download pill don't have
 * a meaningful "shrink the visual" concept the same way). The drag itself
 * only updates local state (`dragWidth`) for a live preview; the store is
 * only written once, on mouseup, so dragging doesn't spam undo history
 * with one step per pixel of mouse movement.
 */
export function EmbedBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const [urlInput, setUrlInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragWidth, setDragWidth] = useState(null);
  const [isAltTextOpen, setIsAltTextOpen] = useState(false);
  const [altDraft, setAltDraft] = useState('');
  const previewRef = useRef(null);
  const frameRef = useRef(null);

  const setMedia = useCallback((patch) => store.applyOperation(updateBlockProps(id, patch)), [store, id]);

  const openAltText = useCallback(() => {
    setAltDraft(block?.props?.alt ?? '');
    setIsAltTextOpen(true);
  }, [block?.props?.alt]);
  const closeAltText = useCallback(() => setIsAltTextOpen(false), []);
  const saveAltText = useCallback(
    (event) => {
      event.preventDefault();
      setMedia({ alt: altDraft.trim() });
      setIsAltTextOpen(false);
    },
    [altDraft, setMedia],
  );

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

  const handleResizeStart = useCallback(
    (event) => {
      event.preventDefault();
      const containerEl = previewRef.current;
      const frameEl = frameRef.current;
      if (!containerEl || !frameEl) return;
      const containerWidth = containerEl.getBoundingClientRect().width;
      const startWidth = frameEl.getBoundingClientRect().width;
      const startX = event.clientX;

      const computePct = (moveEvent) => clampWidth(((startWidth + (moveEvent.clientX - startX)) / containerWidth) * 100);

      const handleMouseMove = (moveEvent) => setDragWidth(computePct(moveEvent));
      const handleMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        setMedia({ width: computePct(upEvent) });
        setDragWidth(null);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [setMedia],
  );

  const className = useBlockClassName('be-embed', block);

  if (!block) return null;
  const { kind = 'file', src, name, alt = '', align = 'left', width = 100 } = block.props;
  const canResize = kind === 'image' || kind === 'video';
  const effectiveWidth = dragWidth ?? width;

  return (
    // tabIndex={-1}: focusable via .focus() (see setSelectedBlockId in
    // EditorProvider.jsx) without joining the normal Tab order — keeps the
    // surface's keydown listener capturing subsequent Backspace/Delete
    // presses once this block becomes selected, even when whatever
    // previously had focus was just removed from the DOM entirely.
    <div className={className} data-block-id={id} data-kind={kind} contentEditable={false} tabIndex={-1}>
      {src ? (
        <div ref={previewRef} className={`be-embed-preview be-embed-align-${align}`}>
          <div
            ref={frameRef}
            className="be-embed-frame"
            style={canResize ? { width: `${effectiveWidth}%` } : undefined}
          >
            <div className="be-embed-toolbar" contentEditable={false}>
              {ALIGN_OPTIONS.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`be-embed-toolbar-btn${align === value ? ' be-embed-toolbar-btn-active' : ''}`}
                  title={label}
                  aria-label={label}
                  aria-pressed={align === value}
                  onClick={() => setMedia({ align: value })}
                >
                  <Icon size={14} />
                </button>
              ))}
              {kind === 'image' && (
                <button type="button" className="be-embed-toolbar-btn be-embed-alt-text-btn" onClick={openAltText}>
                  Alt text
                </button>
              )}
              <button type="button" className="be-embed-remove" onClick={clearMedia} aria-label={`Remove ${KIND_LABEL[kind]}`}>
                Remove
              </button>
            </div>
            <EmbedPreview kind={kind} src={src} name={name} alt={alt} />
            {canResize && (
              <div
                className="be-embed-resize-handle"
                onMouseDown={handleResizeStart}
                role="slider"
                aria-label={`Resize ${KIND_LABEL[kind]}`}
                aria-valuemin={MIN_WIDTH}
                aria-valuemax={MAX_WIDTH}
                aria-valuenow={effectiveWidth}
              />
            )}
          </div>
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
      <Modal isOpen={isAltTextOpen} onClose={closeAltText} title="Alt text">
        <form onSubmit={saveAltText}>
          <label className="be-modal-field">
            <span>Describe this image for screen readers</span>
            <input
              type="text"
              value={altDraft}
              onChange={(event) => setAltDraft(event.target.value)}
              placeholder="e.g. A hand-drawn diagram of the release process"
              autoFocus
            />
          </label>
          <div className="be-modal-actions">
            <button type="button" className="be-modal-cancel" onClick={closeAltText}>
              Cancel
            </button>
            <button type="submit" className="be-modal-save">
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
