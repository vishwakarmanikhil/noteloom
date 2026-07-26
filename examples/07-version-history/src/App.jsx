import { useEffect, useRef } from 'react';
import {
  useEditor,
  NoteloomEditor,
  registerBuiltInBlocks,
  useDocumentVersions,
  createPeriodicVersionSnapshotter,
  saveDocumentVersion,
  applyDocumentTemplate,
  exportDocumentJSON,
} from 'noteloom';

const DOC_ID = 'version-history-demo';

// A short interval so the demo doesn't require actually waiting an hour --
// a real app would use something like 5-10 minutes (createPeriodicVersionSnapshotter's
// own default).
const SNAPSHOT_INTERVAL_MS = 15000;

export function App() {
  const editor = useEditor({ registerBlocks: registerBuiltInBlocks });
  const { versions, isLoaded, refresh } = useDocumentVersions(DOC_ID);
  const snapshotterRef = useRef(null);

  useEffect(() => {
    snapshotterRef.current = createPeriodicVersionSnapshotter({
      store: editor.store,
      docId: DOC_ID,
      intervalMs: SNAPSHOT_INTERVAL_MS,
      onSnapshot: () => refresh(),
    });
    return () => snapshotterRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.store]);

  async function handleSaveNow() {
    const label = window.prompt('Label this version? (optional)') ?? undefined;
    // exportDocumentJSON returns a JSON *string* -- parse it back into the
    // plain object saveDocumentVersion/applyDocumentTemplate both expect.
    const doc = JSON.parse(exportDocumentJSON(editor.store));
    await saveDocumentVersion({ id: crypto.randomUUID(), docId: DOC_ID, timestamp: Date.now(), label, doc });
    await refresh();
  }

  function handleRestore(version) {
    if (!window.confirm(`Restore "${version.label ?? version.id}"? This replaces the current document.`)) return;
    applyDocumentTemplate(editor.store, version.doc);
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 24px', display: 'flex', gap: 32 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'baseline' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Version history demo</h1>
          <button onClick={handleSaveNow}>Save version now</button>
        </div>
        <p style={{ color: '#666', fontSize: 14 }}>
          A snapshot is also saved automatically every {SNAPSHOT_INTERVAL_MS / 1000}s while you edit.
        </p>
        <NoteloomEditor editor={editor} />
      </div>
      <div style={{ width: 260 }}>
        <h2 style={{ fontSize: 16 }}>Versions</h2>
        {!isLoaded && <p>Loading…</p>}
        {isLoaded && versions.length === 0 && <p style={{ color: '#666' }}>No versions saved yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {versions.map((version) => (
            <li key={version.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
              <div style={{ fontWeight: 600 }}>{version.label ?? '(untitled)'}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{new Date(version.timestamp).toLocaleTimeString()}</div>
              <button onClick={() => handleRestore(version)} style={{ marginTop: 6 }}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
