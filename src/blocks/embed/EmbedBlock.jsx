import { useCallback, useRef, useState } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName, useFileUpload } from '../../react/EditorProvider.jsx';
import { updateBlockProps } from '../../store/operations.js';
import { Modal } from '../../react/Modal.jsx';
import {
  PaperclipIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  LinkIcon,
} from '../../react/icons.jsx';
import { resolveFileToSrc } from './resolveFileEmbed.js';
import { resolveOEmbedUrl } from './oembedProviders.js';

const KIND_LABEL = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  oembed: 'embed',
};
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

function EmbedPreview({ kind, src, name, alt, provider }) {
  // Deliberately never falls back to `name` (the uploaded file's raw
  // filename, e.g. "IMG_2481.HEIC", or a pasted URL string) — neither is
  // meaningful alt text, and silently presenting one as if it were a real
  // description is worse than an empty (but at least honest) alt.
  if (kind === 'image') return <img className="be-embed-image" src={src} alt={alt || ''} />;
  if (kind === 'video') return <video className="be-embed-video" src={src} controls />;
  if (kind === 'audio') return <audio className="be-embed-audio" src={src} controls />;
  if (kind === 'oembed') {
    return (
      <iframe
        className="be-embed-oembed"
        src={src}
        title={provider ? `${provider} embed` : 'embed'}
        // A fixed provider allowlist (see oembedProviders.js), never an
        // arbitrary user-supplied origin, is what makes allow-scripts safe
        // here — every embed URL is derived from a known provider's own
        // documented iframe shape, same trust boundary as loading their
        // official embed.js would be.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    );
  }
  return (
    <a
      className="be-embed-file-link"
      href={src}
      download={name || undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
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
 * This package ships no backend of its own, so a picked/dropped file's
 * destination is entirely up to the host: `EditorProvider`'s `uploadFile`
 * option (see `useFileUpload`'s own doc comment for the full contract —
 * local disk, S3, any other cloud storage) is called with the raw `File`
 * when configured. Without it, a file is read via `FileReader` straight
 * into a `data:` URL and stored directly in `props.src` — keeps the
 * document fully self-contained (works offline, round-trips through copy/
 * paste and undo/redo like any other prop) at the cost of bloating the
 * document for large media, which is also why THAT path (and only that
 * path) respects `maxFileSize`, rejecting anything over it with a clear
 * error instead of silently ballooning the document.
 *
 * `isUploading`/`uploadError` are local, ephemeral UI state (not stored on
 * the block) — a real network upload can take a while and can fail, so the
 * dropzone shows a "Uploading…" state meanwhile and a dismissible error
 * message on failure, instead of leaving a click that just silently does
 * nothing until it eventually resolves.
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
  const { uploadFile, maxFileSize } = useFileUpload();
  const [urlInput, setUrlInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragWidth, setDragWidth] = useState(null);
  const [isAltTextOpen, setIsAltTextOpen] = useState(false);
  const [altDraft, setAltDraft] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const previewRef = useRef(null);
  const frameRef = useRef(null);

  const setMedia = useCallback(
    (patch) => store.applyOperation(updateBlockProps(id, patch)),
    [store, id],
  );

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

  // The one path every file (picked or dropped) goes through — see
  // useFileUpload's own doc comment for uploadFile's contract and
  // maxFileSize's scope (the in-document data: URL fallback only).
  const acceptFile = useCallback(
    async (file, kind) => {
      setUploadError(null);
      setIsUploading(true);
      try {
        const { src, name, mimeType } = await resolveFileToSrc(file, {
          uploadFile,
          maxFileSize,
          kind,
        });
        setMedia({ src, name, mimeType });
      } catch (err) {
        setUploadError(err?.message || 'Upload failed. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFile, maxFileSize, setMedia],
  );

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // lets picking the exact same file again re-fire onChange
      if (file) acceptFile(file, block?.props?.kind ?? 'file');
    },
    [acceptFile, block?.props?.kind],
  );

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) acceptFile(file, block?.props?.kind ?? 'file');
    },
    [acceptFile, block?.props?.kind],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  // A pasted URL matching a known provider (see oembedProviders.js) always
  // wins, regardless of which slash command created this block — pasting a
  // YouTube link into an "/image" block's dropzone should still produce a
  // real player, not a broken <img src="https://youtube.com/watch?...">.
  const commitUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const oembed = resolveOEmbedUrl(trimmed);
    if (oembed) {
      setMedia({
        kind: 'oembed',
        src: oembed.embedUrl,
        name: trimmed,
        mimeType: '',
        provider: oembed.provider,
        originalUrl: trimmed,
      });
    } else {
      setMedia({ src: trimmed, name: trimmed });
    }
    setUrlInput('');
  }, [urlInput, setMedia]);

  const clearMedia = useCallback(
    () => setMedia({ src: '', name: '', mimeType: '', provider: '', originalUrl: '' }),
    [setMedia],
  );

  const handleResizeStart = useCallback(
    (event) => {
      event.preventDefault();
      const containerEl = previewRef.current;
      const frameEl = frameRef.current;
      if (!containerEl || !frameEl) return;
      const containerWidth = containerEl.getBoundingClientRect().width;
      const startWidth = frameEl.getBoundingClientRect().width;
      const startX = event.clientX;

      const computePct = (moveEvent) =>
        clampWidth(((startWidth + (moveEvent.clientX - startX)) / containerWidth) * 100);

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

  // The handle's `role="slider"` was previously mouse-only — announced as
  // an operable slider to assistive tech, but Tab never reached it and
  // arrow keys did nothing, an actively misleading gap for a keyboard-only
  // user. Left/Right (Shift for a finer 1% step) and Home/End now actually
  // work, matching what the ARIA role already promised.
  const handleResizeKeyDown = useCallback(
    (event) => {
      const current = block?.props?.width ?? 100;
      const step = event.shiftKey ? 1 : 5;
      let next;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clampWidth(current - step);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
        next = clampWidth(current + step);
      else if (event.key === 'Home') next = MIN_WIDTH;
      else if (event.key === 'End') next = MAX_WIDTH;
      else return;
      event.preventDefault();
      setMedia({ width: next });
    },
    [block?.props?.width, setMedia],
  );

  const className = useBlockClassName('be-embed', block);

  if (!block) return null;
  const {
    kind = 'file',
    src,
    name,
    alt = '',
    align = 'left',
    width = 100,
    provider = '',
    originalUrl = '',
  } = block.props;
  const canResize = kind === 'image' || kind === 'video' || kind === 'oembed';
  const effectiveWidth = dragWidth ?? width;
  const isOEmbed = kind === 'oembed';

  return (
    // tabIndex={-1}: focusable via .focus() (see setSelectedBlockId in
    // EditorProvider.jsx) without joining the normal Tab order — keeps the
    // surface's keydown listener capturing subsequent Backspace/Delete
    // presses once this block becomes selected, even when whatever
    // previously had focus was just removed from the DOM entirely.
    <div
      className={className}
      data-block-id={id}
      data-kind={kind}
      contentEditable={false}
      tabIndex={-1}
    >
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
                <button
                  type="button"
                  className="be-embed-toolbar-btn be-embed-alt-text-btn"
                  onClick={openAltText}
                >
                  Alt text
                </button>
              )}
              {isOEmbed && originalUrl && (
                <a
                  className="be-embed-toolbar-btn be-embed-open-original"
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open original link"
                  aria-label="Open original link"
                >
                  <LinkIcon size={14} />
                </a>
              )}
              <button
                type="button"
                className="be-embed-remove"
                onClick={clearMedia}
                aria-label={`Remove ${KIND_LABEL[kind]}`}
              >
                Remove
              </button>
            </div>
            <EmbedPreview kind={kind} src={src} name={name} alt={alt} provider={provider} />
            {canResize && (
              <div
                className="be-embed-resize-handle"
                onMouseDown={handleResizeStart}
                onKeyDown={handleResizeKeyDown}
                role="slider"
                tabIndex={0}
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
          onDrop={isOEmbed || isUploading ? undefined : handleDrop}
          onDragOver={isOEmbed || isUploading ? undefined : handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isUploading ? (
            <span className="be-embed-uploading">Uploading…</span>
          ) : (
            <>
              {!isOEmbed && (
                <>
                  <label className="be-embed-upload-btn">
                    Upload {KIND_LABEL[kind]}
                    <input
                      type="file"
                      accept={KIND_ACCEPT[kind]}
                      onChange={handleFileChange}
                      hidden
                    />
                  </label>
                  <span className="be-embed-dropzone-hint">
                    or drop a file, or paste a URL below
                  </span>
                </>
              )}
              <div className="be-embed-url-row">
                <input
                  type="text"
                  className="be-embed-url-input"
                  placeholder={
                    isOEmbed
                      ? 'Paste a YouTube, Vimeo, Loom, Figma, CodePen, or Spotify link'
                      : `https://... ${KIND_LABEL[kind]} URL`
                  }
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && commitUrl()}
                />
                <button type="button" className="be-embed-url-commit" onClick={commitUrl}>
                  Embed
                </button>
              </div>
            </>
          )}
          {uploadError && (
            <div className="be-embed-upload-error" role="alert">
              {uploadError}
              <button type="button" onClick={() => setUploadError(null)} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
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
