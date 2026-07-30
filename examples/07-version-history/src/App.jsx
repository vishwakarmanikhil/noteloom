import { useEditor, NoteloomEditor, registerBuiltInBlocks, VersionHistory } from 'noteloom';

const DOC_ID = 'version-history-demo';
const CURRENT_USER_ID = 'You';

// A short idle gap so the demo doesn't require actually waiting 5 minutes
// (createAutoVersionHistory's own default) -- pause typing for this long
// and a version is saved automatically, no "name it and save" step.
const IDLE_MS = 5000;

// A brand-new document (useEditor()'s own default when no `doc` is given)
// starts as ONE EMPTY paragraph -- and this package's placeholder text only
// renders once that block is actually focused (see style.css's
// `[data-placeholder][data-empty]:focus-within::before`, matching Notion's
// own "no placeholder until you click in" behavior). For a first-time demo
// visitor, an empty, placeholder-less paragraph is functionally invisible:
// there's nothing to see or click before you already know it's there. Real
// apps normally load a document with actual content already in it (from
// IndexedDB, an API, ...) where this never comes up -- seeding one here is
// what a real app's own persisted content would already provide.
function makeInitialDoc() {
  const rootId = 'root';
  const blockId = 'p1';
  const runId = 'r1';
  return {
    rootId,
    blocks: [
      { id: rootId, type: 'page', parentId: null, contentIds: [blockId], props: {} },
      { id: blockId, type: 'paragraph', parentId: rootId, contentIds: [runId], props: {} },
    ],
    runs: [{ id: runId, type: 'text', value: 'Click here and start typing…', marks: {} }],
  };
}

export function App() {
  const editor = useEditor({ doc: makeInitialDoc(), registerBlocks: registerBuiltInBlocks, currentUserId: CURRENT_USER_ID });

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Version history demo</h1>
      </div>
      <p style={{ color: '#666', fontSize: 14 }}>
        Type something, then pause for {IDLE_MS / 1000}s — a version is saved automatically, attributed to{' '}
        <code>{CURRENT_USER_ID}</code>. Click "Version history" to browse, preview, and restore past versions.
      </p>
      <NoteloomEditor editor={editor}>
        <div style={{ position: 'fixed', top: 24, right: 24 }}>
          <VersionHistory docId={DOC_ID} idleMs={IDLE_MS} />
        </div>
      </NoteloomEditor>
    </div>
  );
}
