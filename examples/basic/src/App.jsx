import { useMemo, useRef, useState } from 'react';
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
  useEmojiMenuTrigger,
  useAtMenuTrigger,
  useEditorKeyboardShortcuts,
  useWholeDocumentSelection,
  SlashMenu,
  FloatingToolbar,
  useFloatingToolbarTrigger,
  useHistory,
  useEditorStore,
  EditorTrailingSpace,
  usePreviewMode,
  useFieldTypeEditor,
  FieldTypeEditorModal,
  createSelectFieldType,
  BlockRangeActionMenu,
  useBlockRangeDrag,
  DocumentExportButton,
  MobileActionBar,
  useVoiceTyping,
  VoicePermissionModal,
  VoiceListeningIndicator,
  listVoiceCommands,
  Modal,
} from '../../../src/index.js';
import { genId } from '../../../src/utils/idGen.js';
import { MentionIcon } from '../../../src/react/icons.jsx';
import './style.css';

function makeInitialDoc() {
  const rootId = 'root';
  const h1 = genId();
  const rh1 = genId();
  const p1 = genId();
  const rp1 = genId();
  const li1 = genId();
  const rli1 = genId();
  const divider1 = genId();
  const todo1 = genId();
  const rTodo1 = genId();
  const todo2 = genId();
  const rTodo2 = genId();
  const table = genId();
  const row = genId();
  const cellA = genId();
  const rCellA = genId();
  const cellB = genId();
  const rCellB = genId();
  const pDiag = genId();
  const rDiagBefore = genId();
  const selDiag = genId();
  const rDiagAfter = genId();
  const pFollowUp = genId();
  const rFollowUpBefore = genId();
  const assigneeFollowUp = genId();
  const rFollowUpMiddle = genId();
  const dateFollowUp = genId();
  const rFollowUpAfter = genId();
  const callout1 = genId();
  const calloutP1 = genId();
  const rCalloutP1 = genId();
  const quote1 = genId();
  const rQuote1 = genId();
  const code1 = genId();
  const rCode1 = genId();
  const toggle1 = genId();
  const rToggle1 = genId();
  const toggleChild1 = genId();
  const rToggleChild1 = genId();
  const layout1 = genId();
  const col1 = genId();
  const col2 = genId();
  const col3 = genId();
  const colP1 = genId();
  const colP2 = genId();
  const colP3 = genId();
  const rColP1 = genId();
  const rColP2 = genId();
  const rColP3 = genId();
  const toggleHeading1 = genId();
  const rToggleHeading1 = genId();
  const toggleHeadingChild1 = genId();
  const rToggleHeadingChild1 = genId();
  const button1 = genId();
  const rButton1 = genId();
  const embedImage1 = genId();
  const embedFile1 = genId();

  return {
    rootId,
    blocks: [
      {
        id: rootId,
        type: 'page',
        parentId: null,
        contentIds: [
          h1,
          p1,
          pDiag,
          pFollowUp,
          callout1,
          quote1,
          code1,
          toggle1,
          layout1,
          toggleHeading1,
          button1,
          embedImage1,
          embedFile1,
          li1,
          divider1,
          todo1,
          todo2,
          table,
        ],
        props: {},
      },
      { id: h1, type: 'heading', parentId: rootId, contentIds: [rh1], props: { level: 2 } },
      { id: p1, type: 'paragraph', parentId: rootId, contentIds: [rp1], props: {} },
      // Mixed inline content in ONE paragraph: text, an atomic "select" chip,
      // then more text — deliberately not forced onto its own line, unlike
      // most block editors. See src/inlineTypes/select for how this works.
      {
        id: pDiag,
        type: 'paragraph',
        parentId: rootId,
        contentIds: [rDiagBefore, selDiag, rDiagAfter],
        props: {},
      },
      // A second mixed-inline paragraph: text, an "Assignee" chip (a
      // host-defined custom field type, reachable via "@" — see this
      // file's inlineRegistry.register('assignee', ...) below — as well as
      // "/assignee"), more text, a date chip, more text — proving a
      // second, differently-triggered inline type also splices in
      // correctly at arbitrary positions within a run of text.
      {
        id: pFollowUp,
        type: 'paragraph',
        parentId: rootId,
        contentIds: [rFollowUpBefore, assigneeFollowUp, rFollowUpMiddle, dateFollowUp, rFollowUpAfter],
        props: {},
      },
      { id: callout1, type: 'callout', parentId: rootId, contentIds: [calloutP1], props: { icon: '💡' } },
      { id: calloutP1, type: 'paragraph', parentId: callout1, contentIds: [rCalloutP1], props: {} },
      { id: quote1, type: 'blockquote', parentId: rootId, contentIds: [rQuote1], props: {} },
      { id: code1, type: 'code', parentId: rootId, contentIds: [rCode1], props: { language: 'javascript' } },
      {
        id: li1,
        type: 'listItem',
        parentId: rootId,
        contentIds: [],
        props: { ordered: false, titleRunIds: [rli1] },
      },
      {
        id: toggle1,
        type: 'listItem',
        parentId: rootId,
        contentIds: [toggleChild1],
        props: { ordered: false, collapsed: false, titleRunIds: [rToggle1] },
      },
      { id: toggleChild1, type: 'paragraph', parentId: toggle1, contentIds: [rToggleChild1], props: {} },
      { id: layout1, type: 'layout', parentId: rootId, contentIds: [col1, col2, col3], props: {} },
      { id: col1, type: 'layoutColumn', parentId: layout1, contentIds: [colP1], props: {} },
      { id: col2, type: 'layoutColumn', parentId: layout1, contentIds: [colP2], props: {} },
      { id: col3, type: 'layoutColumn', parentId: layout1, contentIds: [colP3], props: {} },
      { id: colP1, type: 'paragraph', parentId: col1, contentIds: [rColP1], props: {} },
      { id: colP2, type: 'paragraph', parentId: col2, contentIds: [rColP2], props: {} },
      { id: colP3, type: 'paragraph', parentId: col3, contentIds: [rColP3], props: {} },
      {
        id: toggleHeading1,
        type: 'toggleHeading',
        parentId: rootId,
        contentIds: [toggleHeadingChild1],
        props: { level: 2, collapsed: false, titleRunIds: [rToggleHeading1] },
      },
      {
        id: toggleHeadingChild1,
        type: 'paragraph',
        parentId: toggleHeading1,
        contentIds: [rToggleHeadingChild1],
        props: {},
      },
      { id: button1, type: 'button', parentId: rootId, contentIds: [rButton1], props: { href: 'https://example.com' } },
      {
        id: embedImage1,
        type: 'embed',
        parentId: rootId,
        contentIds: [],
        props: {
          kind: 'image',
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Crect width='160' height='90' fill='%232b6fd6'/%3E%3Ctext x='80' y='50' font-size='16' fill='white' text-anchor='middle' font-family='sans-serif'%3EDemo image%3C/text%3E%3C/svg%3E",
          name: 'demo image',
          mimeType: 'image/svg+xml',
        },
      },
      { id: embedFile1, type: 'embed', parentId: rootId, contentIds: [], props: { kind: 'file', src: '', name: '', mimeType: '' } },
      { id: divider1, type: 'divider', parentId: rootId, contentIds: [], props: {} },
      {
        id: todo1,
        type: 'listItem',
        parentId: rootId,
        contentIds: [],
        props: { ordered: false, checked: true, titleRunIds: [rTodo1] },
      },
      {
        id: todo2,
        type: 'listItem',
        parentId: rootId,
        contentIds: [],
        props: { ordered: false, checked: false, titleRunIds: [rTodo2] },
      },
      { id: table, type: 'table', parentId: rootId, contentIds: [row], props: {} },
      { id: row, type: 'tableRow', parentId: table, contentIds: [cellA, cellB], props: {} },
      { id: cellA, type: 'tableCell', parentId: row, contentIds: [rCellA], props: {} },
      { id: cellB, type: 'tableCell', parentId: row, contentIds: [rCellB], props: {} },
    ],
    runs: [
      { id: rh1, type: 'text', value: 'Block editor demo — type "/" for commands, "@" to assign someone', marks: {} },
      {
        id: rp1,
        type: 'text',
        value: 'Type here. Select text and press Ctrl+B/I/U to format. Ctrl+Z/Ctrl+Shift+Z to undo/redo.',
        marks: {},
      },
      { id: rDiagBefore, type: 'text', value: 'Diagnosis: ', marks: {} },
      {
        id: selDiag,
        type: 'select',
        value: '',
        marks: {},
        data: {
          options: [
            { value: 'flu', label: 'Influenza' },
            { value: 'cold', label: 'Common cold' },
            { value: 'allergy', label: 'Allergic rhinitis' },
          ],
          selectedValue: 'flu',
          placeholder: 'Select diagnosis…',
        },
      },
      { id: rDiagAfter, type: 'text', value: ' — confirmed on exam.', marks: {} },
      { id: rFollowUpBefore, type: 'text', value: 'Follow up with ', marks: {} },
      {
        id: assigneeFollowUp,
        type: 'assignee',
        value: '',
        marks: {},
        data: { selectedValue: 'u2', selectedLabel: 'Bailey Chen' },
      },
      { id: rFollowUpMiddle, type: 'text', value: ' on ', marks: {} },
      {
        id: dateFollowUp,
        type: 'date',
        value: '',
        marks: {},
        data: { isoDate: '2026-07-11' },
      },
      { id: rFollowUpAfter, type: 'text', value: '.', marks: {} },
      {
        id: rCalloutP1,
        type: 'text',
        value: "This is a callout — click the icon to change it, or select the whole box and it copies/pastes/deletes as one unit.",
        marks: {},
      },
      {
        id: rQuote1,
        type: 'text',
        value: 'A quote — Enter exits it into a new paragraph, Backspace at the start merges it away.',
        marks: {},
      },
      {
        id: rCode1,
        type: 'text',
        value: 'function greet(name) {\n  return `Hello, ${name}!`;\n}',
        marks: {},
      },
      {
        id: rToggle1,
        type: 'text',
        value: 'A toggle — click the triangle to collapse/expand its content.',
        marks: {},
      },
      { id: rToggleChild1, type: 'text', value: 'Hidden content, revealed when expanded.', marks: {} },
      { id: rColP1, type: 'text', value: 'Column 1', marks: {} },
      { id: rColP2, type: 'text', value: 'Column 2', marks: {} },
      { id: rColP3, type: 'text', value: 'Column 3 — try "/columns" for 2-5 columns.', marks: {} },
      {
        id: rToggleHeading1,
        type: 'text',
        value: 'A toggle heading — collapses everything under it, try "/toggle heading".',
        marks: {},
      },
      {
        id: rToggleHeadingChild1,
        type: 'text',
        value: 'This paragraph lives inside the toggle heading and hides when it collapses.',
        marks: {},
      },
      { id: rButton1, type: 'text', value: 'Visit example.com', marks: {} },
      { id: rli1, type: 'text', value: 'A list item — press Enter for a new one, Tab to indent', marks: {} },
      { id: rTodo1, type: 'text', value: 'A completed to-do', marks: {} },
      { id: rTodo2, type: 'text', value: 'An open to-do — click the checkbox', marks: {} },
      { id: rCellA, type: 'text', value: 'Cell A', marks: {} },
      { id: rCellB, type: 'text', value: 'Cell B', marks: {} },
    ],
  };
}

// Demonstrates listVoiceCommands() — pure data from the library, rendered
// however the host app likes. Built on the library's own Modal, same as
// VoicePermissionModal, so it matches the rest of the editor's chrome for
// free.
function VoiceCommandsModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Voice commands">
      <ul className="be-voice-commands-list">
        {listVoiceCommands().map((command) => (
          <li key={command.phrases[0]}>
            <strong>{command.phrases.map((p) => `"${p}"`).join(' / ')}</strong> — {command.description}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function Toolbar() {
  const history = useHistory();
  const [isPreviewMode, setIsPreviewMode] = usePreviewMode();
  const { openCreate } = useFieldTypeEditor();
  const voice = useVoiceTyping();
  const [isCommandsModalOpen, setIsCommandsModalOpen] = useState(false);
  return (
    <div className="be-toolbar">
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
      <button type="button" onClick={openCreate}>
        + Field type
      </button>
      <button
        type="button"
        className={isPreviewMode ? 'be-toolbar-btn-active' : undefined}
        onClick={() => setIsPreviewMode((v) => !v)}
      >
        {isPreviewMode ? 'Edit' : 'Preview'}
      </button>
      <DocumentExportButton />
      {/* window.print() is the whole "PDF export" story here — see
          style.css's @media print block. No PDF library is bundled
          (would conflict with the zero-runtime-dependency design); the
          browser's own print-to-PDF (Ctrl+P -> Save as PDF) is what
          actually produces the file. */}
      <button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      {voice.isSupported && (
        <>
          <button
            type="button"
            className={voice.isListening ? 'be-toolbar-btn-active' : undefined}
            onClick={() => (voice.isListening ? voice.stop() : voice.start())}
            title="Ctrl/Cmd+Shift+M also toggles this. Say a command like &quot;heading one&quot; or &quot;new paragraph&quot; while dictating, or say &quot;stop dictation&quot; to stop."
          >
            {voice.isListening ? 'Stop dictation' : 'Start dictation'}
          </button>
          <button type="button" onClick={() => setIsCommandsModalOpen(true)}>
            Voice commands
          </button>
          <VoiceCommandsModal isOpen={isCommandsModalOpen} onClose={() => setIsCommandsModalOpen(false)} />
          <VoicePermissionModal voice={voice} />
          <VoiceListeningIndicator voice={voice} />
        </>
      )}
    </div>
  );
}

function EditorSurface() {
  const containerRef = useRef(null);
  const store = useEditorStore();
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  const emojiMenu = useEmojiMenuTrigger(containerRef);
  const atMenu = useAtMenuTrigger(containerRef);
  const floatingToolbar = useFloatingToolbarTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);
  useBlockRangeDrag(containerRef);
  const [isWholeDocumentSelected] = useWholeDocumentSelection();

  return (
    <div
      ref={containerRef}
      className={`be-surface${isWholeDocumentSelected ? ' be-surface--all-selected' : ''}`}
      role="document"
      aria-label="Document editor"
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
    >
      <Toolbar />
      <FieldTypeEditorModal />
      <BlockRangeActionMenu />
      <BlockChildren parentId="root" isTopLevel />
      <EditorTrailingSpace />
      <SlashMenu
        isOpen={slashMenu.isOpen}
        rect={slashMenu.rect}
        commands={slashMenu.commands}
        runId={slashMenu.runId}
        onSelect={slashMenu.selectCommand}
        onClose={slashMenu.close}
      />
      <SlashMenu
        isOpen={emojiMenu.isOpen}
        rect={emojiMenu.rect}
        commands={emojiMenu.commands}
        runId={emojiMenu.runId}
        onSelect={emojiMenu.selectCommand}
        onClose={emojiMenu.close}
        menuId="be-emoji-menu"
        ariaLabel="Emoji"
      />
      <SlashMenu
        isOpen={atMenu.isOpen}
        rect={atMenu.rect}
        commands={atMenu.commands}
        runId={atMenu.runId}
        onSelect={atMenu.selectCommand}
        onClose={atMenu.close}
        menuId="be-at-menu"
        ariaLabel="Mention"
      />
      <FloatingToolbar
        isOpen={floatingToolbar.isOpen}
        rect={floatingToolbar.rect}
        kind={floatingToolbar.kind}
        selection={floatingToolbar.selection}
        crossSelection={floatingToolbar.crossSelection}
        marks={floatingToolbar.marks}
        store={store}
      />
      <MobileActionBar containerRef={containerRef} />
    </div>
  );
}

export function App() {
  const { store, registry, inlineRegistry } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);

    // Demo of a host-app-defined, DYNAMIC (DB/API-backed) custom field
    // type: options come from a function, not a static array, called
    // fresh on every query (see Select.jsx) — never persisted in the
    // document, since only the host's own code knows how to search it.
    // Contrast with the in-editor "+ Field type" button (static-only,
    // persisted via the store's fieldTypes collection — see
    // FieldTypeEditorModal / registerStoredFieldTypes).
    //
    // This is also the package's "@name" mention mechanism: there's no
    // separate hardcoded built-in for it (a real roster/search always
    // needs to be host-supplied anyway) — `triggers: ['slash', 'at']`
    // is what makes this one show up under "@" (via useAtMenuTrigger)
    // as well as "/", matching the familiar @-mention pattern.
    const demoAssignees = [
      { value: 'u1', label: 'Alex Rivera' },
      { value: 'u2', label: 'Bailey Chen' },
      { value: 'u3', label: 'Casey Nguyen' },
      { value: 'u4', label: 'Drew Patel' },
    ];
    inlineRegistry.register(
      'assignee',
      createSelectFieldType({
        type: 'assignee',
        label: 'Assignee',
        placeholder: 'Assign to…',
        variant: 'tag',
        icon: MentionIcon,
        triggers: ['slash', 'at'],
        options: (query) =>
          new Promise((resolve) => {
            setTimeout(() => {
              const q = query.toLowerCase();
              resolve(demoAssignees.filter((o) => o.label.toLowerCase().includes(q)));
            }, 300);
          }),
      }),
    );

    const rawStore = new EditorStore(makeInitialDoc());
    const store = new History(rawStore);
    return { store, registry, inlineRegistry };
  }, []);

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
      <EditorSurface />
    </EditorProvider>
  );
}
