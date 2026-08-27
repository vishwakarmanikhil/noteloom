import { useRef, useState } from 'react';
import {
  useEditor,
  NoteloomEditor,
  registerBuiltInBlocks,
  registerBlockTemplates,
  useTemplates,
  TemplatePicker,
  saveTemplate,
  exportDocumentJSON,
} from 'noteloom';
import { blockSnippets } from './blockSnippets.js';

// Screen 1: pick a document template (or start blank, or import one from a
// JSON file) before an editor even exists yet -- see README's "Templates"
// section for why this needs no new primitives beyond useTemplates/
// TemplatePicker/saveTemplate.
function NewDocumentScreen({ onStart }) {
  const { templates, isLoaded, refresh } = useTemplates({ scope: 'document' });
  const fileInputRef = useRef(null);

  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const template = JSON.parse(await file.text()); // a template is already plain JSON -- no special import format
    await saveTemplate(template);
    await refresh();
    event.target.value = '';
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <h1>Start a new document</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => onStart(null)}>Blank document</button>
        <button onClick={() => fileInputRef.current.click()}>Import template from JSON…</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </div>
      {isLoaded && (
        <TemplatePicker
          templates={templates}
          onSelect={(template) => onStart(template.doc)}
          emptyLabel="No saved document templates yet."
        />
      )}
    </div>
  );
}

// Screen 2: the actual editor, seeded from whatever Screen 1 chose. Two
// developer-defined block snippets (see blockSnippets.js) are registered
// alongside every built-in block, insertable via "/agenda" or "/action" --
// and "Save as template" captures the current document for Screen 1's
// picker to show next time.
function EditorScreen({ initialDoc, onBack }) {
  const editor = useEditor({
    doc: initialDoc ?? undefined,
    registerBlocks: (registry) => {
      registerBuiltInBlocks(registry);
      registerBlockTemplates(registry, blockSnippets);
    },
  });

  async function handleSaveAsTemplate() {
    const name = window.prompt('Template name?');
    if (!name) return;
    // exportDocumentJSON returns a JSON *string* (it's the "view source"/
    // copy-out format) -- parse it back into the plain object useEditor({doc}) wants.
    await saveTemplate({
      id: crypto.randomUUID(),
      scope: 'document',
      name,
      doc: JSON.parse(exportDocumentJSON(editor.store)),
    });
    window.alert('Saved — go back to see it in the gallery.');
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={onBack}>&larr; Back</button>
        <button onClick={handleSaveAsTemplate}>Save as template</button>
      </div>
      <p style={{ color: '#666', fontSize: 14 }}>
        Type "/agenda" or "/action" to insert a block snippet.
      </p>
      <NoteloomEditor editor={editor} />
    </div>
  );
}

export function App() {
  const [state, setState] = useState({ started: false, doc: null });

  if (!state.started) {
    return <NewDocumentScreen onStart={(doc) => setState({ started: true, doc })} />;
  }
  return (
    <EditorScreen
      key={state.doc ? 'from-template' : 'blank'}
      initialDoc={state.doc}
      onBack={() => setState({ started: false, doc: null })}
    />
  );
}
