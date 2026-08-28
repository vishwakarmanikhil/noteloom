# Migration guide

## 0.3.x → 0.5.0

**Nothing breaks.** Every change in this release is additive — your existing
code runs unchanged. The items below are new, recommended ways to do things, and
a list of what will be removed in a future major version so you can migrate at
your own pace.

### New: opt-in subpath entry points

The heavy optional features now have their own import paths, so a bundle that
doesn't use them can drop the code:

| Was                                                                                                                     | Now (preferred)                              |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `import { CollabSession, PeerConnection, HLC, … } from 'noteloom'`                                                      | `from 'noteloom/collab'`                     |
| `import { usePersistedDocument, createAutoPersistence, savePersistedDocument, useServiceWorkerUpdate } from 'noteloom'` | `from 'noteloom/persistence'`                |
| `import { addComment, useComments, CommentsPanel, … } from 'noteloom'`                                                  | `from 'noteloom/comments'`                   |
| `import { createAutoVersionHistory, VersionHistory, diffDocumentsHTML, useDocumentVersions } from 'noteloom'`           | `from 'noteloom/versions'`                   |
| `import { useVoiceTyping, VoicePermissionModal, VoiceListeningIndicator, listVoiceCommands } from 'noteloom'`           | `from 'noteloom/voice'`                      |
| `import { canvasBlockType } from 'noteloom'`                                                                            | `from 'noteloom/canvas'`                     |
| `import 'noteloom/style.css'`                                                                                           | `import 'noteloom/theme'` (alias; both work) |

The old imports from `'noteloom'` still resolve. They're **deprecated** and will
be removed in **2.0** — see below.

### New: the `defineBlock` / `extensions` API

```jsx
// Was:
const editor = useEditor({
  registerBlocks: (registry) => {
    registerBuiltInBlocks(registry);
    registry.register('rating', ratingBlockType); // a bare object
  },
});

// Now (preferred):
import { defineBlock, starterKit } from 'noteloom';
const ratingBlock = defineBlock({
  name: 'rating',
  component: RatingBlock,
  contentModel: 'void' /* … */,
});
const editor = useEditor({ extensions: [...starterKit(), ratingBlock] });
```

- `defineBlock()` / `defineInline()` validate the config and tag the result; it's
  still a plain registry entry, so `registry.register('rating', ratingBlock)`
  also works.
- `defineExtension({ name, blocks?, inlineTypes?, keymap?, onBeforeInput?, onPaste?, setup? })`
  bundles types and/or behavior into one `extensions` item.
- `starterKit()` is every built-in type as an array; `starterKit({ exclude })`
  drops some. `useEditor()` with no `extensions` still registers exactly that set.
- `smartQuotes()` / `autoPairBrackets()` are the `useSmartQuotes` /
  `useAutoPairBrackets` behaviors in `extensions` form.
- Scaffold a new type: `npx noteloom new block <name>` / `new inline <name>`.

`registerBlocks` / `registerBuiltInBlocks` / `registerInlineTypes` /
`registerBuiltInInlineTypes` still work. They're **deprecated** for removal in
**2.0**.

### New: the document format

- `editor.toJSON()` returns the simple format (`{ version, blocks: [{ id, type,
data, children? }] }`) — schema at [`document.schema.json`](document.schema.json).
- `useEditor({ doc })` now accepts **either** the simple format or the internal
  `{ rootId, blocks, runs }` shape (auto-detected).
- `editor.toJSON({ format: 'internal' })` / `exportDocumentJSON()` still give the
  normalized graph.
- `exportDocumentSimpleJSON` / `importDocumentSimpleJSON` are unchanged.

### Note: built file names changed

`dist/noteloom.es.js` → `dist/index.js`, `dist/noteloom.cjs` → `dist/index.cjs`.
Invisible if you import the package by name (the `exports` map handles it); only
matters if you deep-linked a file path.

## What's planned for 2.0 (the one breaking release)

- The main-`noteloom`-entry re-exports of the moved features (the left column of
  the table above) are removed. Use the subpaths.
- `registerBlocks` / `registerBuiltInBlocks` / `registerInlineTypes` /
  `registerBuiltInInlineTypes` are removed. Use `extensions` + `starterKit()`.
- A codemod will be provided for the mechanical import moves.

No date — 2.0 comes only after the replacements have shipped across several
minor versions. Until then, both paths work.

## Undecided

- Whether the default theme stops auto-injecting (making `import 'noteloom/theme'`
  required). If it changes, a deprecation warning ships at least one minor
  version ahead.
