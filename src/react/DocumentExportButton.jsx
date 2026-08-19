import { useCallback, useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';
import { useEditorStore, useBlockRegistry, useInlineRegistry } from './EditorProvider.jsx';
import {
  exportDocumentJSON,
  exportDocumentHTML,
  exportDocumentText,
  exportDocumentMarkdown,
  exportDocumentWordHTML,
} from '../clipboard/exportDocument.js';
import { exportDocumentSimpleJSON } from '../clipboard/simpleFormat.js';
import { CodeIcon } from './icons.jsx';

const FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'simpleJson', label: 'Simple JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Text' },
];

/**
 * Drop-in "view source" button + modal — mount it once anywhere under
 * <EditorProvider> to give a host app (or its own end users, if exposed)
 * a way to inspect the live document as JSON, HTML, Markdown, or plain
 * text, without having to hand-roll the export/modal/copy plumbing
 * themselves.
 *
 * These formats aren't different features — JSON/HTML/Markdown/Text are
 * the same export pulled through the existing serialization paths every
 * other document-reading feature (clipboard, in particular) already goes
 * through (see clipboard/exportDocument.js). "Simple JSON" is a separate,
 * optional, flatter shape (see clipboard/simpleFormat.js) — self-contained
 * blocks with `children` for nesting instead of the internal engine's own
 * id-referenced graph — meant for storage/API/CRUD use where "JSON" tab's
 * raw internal shape is more structure than a host actually wants to work
 * with directly. All five are just packaged behind one button so each host
 * app doesn't need to wire its own; a host that wants the raw strings
 * without any UI can call exportDocumentJSON/exportDocumentSimpleJSON/HTML/
 * Markdown/Text directly instead of using this component at all.
 *
 * Recomputes the export fresh every time the modal opens (not on every
 * keystroke while it's closed) — cheap enough for real documents, and
 * guarantees what's shown always matches the live store exactly, with no
 * separate cache to keep in sync.
 */
export function DocumentExportButton({ label = 'View source', className = '' }) {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState('json');
  const [copied, setCopied] = useState(false);

  const open = useCallback(() => {
    setCopied(false);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const content = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'json') return exportDocumentJSON(store);
    if (format === 'simpleJson') return exportDocumentSimpleJSON(store, registry, inlineRegistry);
    if (format === 'html') return exportDocumentHTML(store, registry, inlineRegistry);
    if (format === 'markdown') return exportDocumentMarkdown(store, registry, inlineRegistry);
    return exportDocumentText(store, registry, inlineRegistry);
  }, [isOpen, format, store, registry, inlineRegistry]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied/unavailable (e.g. insecure context) —
      // the content is still fully visible and selectable in the <pre>,
      // so this is a soft failure, not a dead end.
    }
  }, [content]);

  // A `data:` URL + temporary appended-then-clicked <a download>, not
  // Blob/URL.createObjectURL — same reasoning as CanvasBlock's own PNG
  // export: fewer moving parts, works in more environments, and Firefox in
  // particular doesn't reliably fire a download from a detached anchor.
  // encodeURIComponent (not btoa) is UTF-8 safe for any document content.
  const handleDownloadWord = useCallback(() => {
    const html = exportDocumentWordHTML(store, registry, inlineRegistry);
    const link = document.createElement('a');
    link.href = `data:application/msword;charset=utf-8,${encodeURIComponent(html)}`;
    link.download = 'document.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [store, registry, inlineRegistry]);

  // No PDF-writing code of its own — the browser's native "Print" dialog
  // (Save as PDF is a standard destination there in every major browser)
  // IS the zero-dependency path here, and the existing @media print
  // stylesheet already hides every piece of editor-only chrome (toolbars,
  // menus, the gutter, this very modal) so what prints is just the
  // document content. A host page's OWN surrounding chrome (nav bars,
  // sidebars) is outside this package's reach — same boundary as
  // everything else it doesn't own — so a host wanting a fully clean
  // printout should scope its own print CSS around the editor similarly.
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <>
      <button type="button" className={`be-export-trigger ${className}`.trim()} onClick={open}>
        <CodeIcon size={14} /> {label}
      </button>
      <Modal isOpen={isOpen} onClose={close} title="Document source" size="large">
        <div className="be-export-tabs" role="tablist">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={format === f.value}
              className={`be-export-tab${format === f.value ? ' be-export-tab-active' : ''}`}
              onClick={() => setFormat(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <pre className="be-export-pre">
          <code>{content}</code>
        </pre>
        <div className="be-modal-actions">
          <button type="button" className="be-modal-cancel" onClick={close}>
            Close
          </button>
          <button type="button" className="be-export-download" onClick={handlePrint}>
            Print / Save as PDF
          </button>
          <button type="button" className="be-export-download" onClick={handleDownloadWord}>
            Download Word (.doc)
          </button>
          <button type="button" className="be-modal-save" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </Modal>
    </>
  );
}
