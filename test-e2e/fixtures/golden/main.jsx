import { createRoot } from 'react-dom/client';
import {
  useEditor,
  NoteloomEditor,
  exportDocumentJSON,
  exportDocumentHTML,
  exportDocumentMarkdown,
  exportDocumentText,
  exportDocumentSimpleJSON,
} from 'noteloom';
import { goldenDoc } from './doc.js';

// The golden-document e2e spec drives this page. It renders the deterministic
// fixture through the SIMPLE public path (useEditor + NoteloomEditor) — the
// one the repackaging plan most needs to keep stable — and hangs the real
// exported serialization functions off `window.__noteloom` so the spec can
// snapshot their output without reaching into internals.
function App() {
  const editor = useEditor({ doc: goldenDoc });
  const { store, registry, inlineRegistry } = editor;

  window.__noteloom = {
    store,
    json: () => exportDocumentJSON(store),
    simpleJson: () => exportDocumentSimpleJSON(store, registry, inlineRegistry),
    html: () => exportDocumentHTML(store, registry, inlineRegistry),
    markdown: () => exportDocumentMarkdown(store, registry, inlineRegistry),
    text: () => exportDocumentText(store, registry, inlineRegistry),
  };
  window.__noteloomReady = true;

  return (
    <div style={{ maxWidth: 760, margin: '32px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
