# API stability

What semantic versioning covers, and what it doesn't. This is the contract
`1.0` will freeze; it already holds as of `0.4.x` in practice.

## Stable — a breaking change here means a major version

**Entry points.** The set of published subpaths: `noteloom`, `noteloom/react`
(implicit — the React exports on the main entry), `noteloom/collab`,
`noteloom/persistence`, `noteloom/comments`, `noteloom/versions`,
`noteloom/voice`, `noteloom/canvas`, `noteloom/starter-kit`, `noteloom/theme`,
`noteloom/style.css`.

**The `noteloom` main entry** — every named export (frozen by
`test/publicApi.test.js`). Adding an export is a minor; removing or changing the
signature of one is a major.

**The extension authoring API:**

- `defineBlock(config)` / `defineInline(config)` / `defineExtension(config)` —
  the accepted config fields and their meaning, and the shape of the returned
  object (`kind`, `name`, plus the passed-through registry-entry fields).
- `registerExtensions(extensions, { registry, inlineRegistry })`.
- `useEditor({ doc, history, currentUserId, extensions, registerBlocks,
registerInlineTypes })` and the shape it returns (`{ store, registry,
inlineRegistry, extensions, toJSON }`).
- The **`ctx` facade** passed to `defineExtension` behavior handlers:
  `store`, `registry`, `inlineRegistry`, `container`, `getBlock`, `getRun`,
  `getRootId`, `applyOperation`, `applyOperations`, `getSelection`, `getCaret`,
  `setCaret`, `subscribe`. Fields may be **added**; existing ones won't change
  or disappear without a major.
- `keymap` string syntax (`Mod` / `Shift` / `Alt` + key), and the
  "return truthy = handled" contract for `keymap` / `onBeforeInput` / `onPaste`.

**The document format.** The simple format (`{ version, blocks: [{ id, type,
data, children? }] }`), described by `docs/document.schema.json`. The schema is
versioned; `version: 1` will not change shape. `editor.toJSON()` returns it;
`useEditor({ doc })` accepts it.

**Built-in block/inline `type` names** — `paragraph`, `heading`, `listItem`,
`table`/`tableRow`/`tableCell`, `layout`/`layoutColumn`, `divider`, `callout`,
`blockquote`, `code`, `toggleHeading`, `button`, `embed`, `canvas`; `select`,
`date`, `checkbox`, `tableSelect`, `emoji`. Their persisted `data` shape in the
simple format.

## Experimental — may change in a minor

- **`noteloom/collab`** (the CRDT + WebRTC layer). Documented as experimental in
  the README; the merge/wire format is not frozen.
- The **internal document shape** (`{ rootId, blocks, runs }`) reachable via
  `editor.toJSON({ format: 'internal' })` / `exportDocumentJSON` — unversioned,
  an implementation detail. Use it for collab/debug, not as a storage contract.
- `useVoiceTyping` / the voice command table (`listVoiceCommands`) — browser
  `SpeechRecognition` behavior varies; the command phrases may be tuned.

## Deprecated — still works, removed in `2.0`

- Importing the moved-feature symbols (`CollabSession`, `usePersistedDocument`,
  the comment / version / voice / canvas exports, …) from the **main `noteloom`
  entry**. Use the subpath.
- `registerBlocks` / `registerBuiltInBlocks` / `registerInlineTypes` /
  `registerBuiltInInlineTypes`. Use `extensions` + `starterKit()`.
- **Default-theme auto-injection.** A future major drops it; a one-time dev
  `console.warn` ships from `0.4.x`. Use `import 'noteloom/theme'` or
  `theme="none"`.

A codemod for the mechanical import moves will ship before `2.0`.

## Internal — no stability guarantee, don't import

- Anything under a deep path (`noteloom/dist/...`, `src/...` in the repo) that
  isn't re-exported from a published entry point.
- `EditorStore` / `History` internals beyond their documented methods
  (`_types`, private fields, the operation object shapes — use `operations.*`).
- `src/index.d.ts` is hand-written; a type being loose (`unknown`, permissive)
  is not a promise about the runtime value, just the current type coverage.
