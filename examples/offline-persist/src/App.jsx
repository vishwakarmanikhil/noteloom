import { useMemo, useRef } from 'react';
import {
  EditorStore,
  History,
  EditorProvider,
  BlockChildren,
  createBlockRegistry,
  registerBuiltInBlocks,
  createInlineRegistry,
  registerBuiltInInlineTypes,
  useClipboardHandlers,
  useSlashMenuTrigger,
  useEditorKeyboardShortcuts,
  useHistory,
  usePersistedDocument,
  useServiceWorkerUpdate,
  SlashMenu,
} from 'noteloom';
import './style.css';

function makeStarterDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['title', 'body'], props: {} },
      { id: 'title', type: 'heading', parentId: 'root', contentIds: ['rTitle'], props: { level: 2 } },
      { id: 'body', type: 'paragraph', parentId: 'root', contentIds: ['rBody'], props: {} },
    ],
    runs: [
      { id: 'rTitle', type: 'text', value: 'Offline persistence demo', marks: {} },
      { id: 'rBody', type: 'text', value: 'Type here, then reload this page (or close and reopen the tab) — your edits survive, entirely offline.', marks: {} },
    ],
  };
}

const DOC_ID = new URLSearchParams(window.location.search).get('doc') ?? 'offline-persist-demo';

function Toolbar({ isLoaded }) {
  const history = useHistory();
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  return (
    <div className="collab-toolbar">
      {history && (
        <>
          <button type="button" disabled={!history.canUndo} onClick={history.undo}>
            Undo
          </button>
          <button type="button" disabled={!history.canRedo} onClick={history.redo}>
            Redo
          </button>
        </>
      )}
      <span className="collab-toolbar-note">
        {isLoaded ? 'Saved locally (IndexedDB) — no server, no internet.' : 'Loading…'}
      </span>
      {updateAvailable && (
        <button type="button" className="collab-update-btn" onClick={applyUpdate}>
          Update available — reload
        </button>
      )}
    </div>
  );
}

function EditorSurface() {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  return (
    <div ref={containerRef} className="collab-surface" onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <BlockChildren parentId="root" />
      <SlashMenu
        isOpen={slashMenu.isOpen}
        rect={slashMenu.rect}
        commands={slashMenu.commands}
        runId={slashMenu.runId}
        onSelect={slashMenu.selectCommand}
        onClose={slashMenu.close}
      />
    </div>
  );
}

export function App() {
  const { store, registry, inlineRegistry } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    const store = new History(new EditorStore(makeStarterDoc()));
    return { store, registry, inlineRegistry };
  }, []);

  const { isLoaded } = usePersistedDocument({ store, docId: DOC_ID });

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
      <div className="collab-page">
        <Toolbar isLoaded={isLoaded} />
        {isLoaded ? <EditorSurface /> : <p className="collab-loading">Loading your document…</p>}
      </div>
    </EditorProvider>
  );
}
