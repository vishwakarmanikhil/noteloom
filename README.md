# noteloom

[![version](https://img.shields.io/npm/v/noteloom.svg?label=version&color=3178c6)](https://www.npmjs.com/package/noteloom)
[![downloads](https://img.shields.io/npm/dm/noteloom.svg?label=downloads&color=44cc11)](https://www.npmjs.com/package/noteloom)
[![license](https://img.shields.io/npm/l/noteloom.svg?label=license&color=44cc11)](https://github.com/vishwakarmanikhil/noteloom/blob/master/LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-333?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/vishwakarmanikhil)

**[Live site & docs →](https://noteloom.qusere.in)** · **[Play with the demo →](https://noteloom.qusere.in/playground/)**

A React-first, block-based rich text editor with **zero runtime dependencies** — the only things it expects from your app are `react` and `react-dom`. Everything else (undo/redo, clipboard, slash commands, tables, inline widgets) is built from scratch on top of a small normalized document store.

## ✨ Highlights

- **11 built-in block types** — paragraph, heading, list (bulleted/numbered/to-do/toggle), table, multi-column layout, divider, callout, blockquote, code, toggle heading, button, and embed.
- **Inline widgets mid-sentence** — select dropdowns, dates, checkboxes, and `@mentions`, spliced directly into running text, not forced onto their own line.
- **A real default theme**, injected automatically, fully retheme-able via CSS custom properties, or opt out entirely and bring your own.
- **Mobile/touch-first UI** — a bottom action bar, tap-friendly block picker, and touch-aware popovers, not just a desktop UI that technically renders on a phone.
- **Voice typing** — continuous dictation plus spoken structural commands ("heading one", "bulleted list", "undo") via the browser's own Speech API, no SDK bundled.
- **RTL & accessibility built in** — automatic per-block text direction, keyboard-operable menus, live-region announcements, and more.
- **Two JSON export shapes** — the normalized engine format, or a simpler self-contained shape for storage/API/CRUD use — plus HTML and plain-text export, all with a drop-in "View source" button.
- **Zero runtime dependencies**, a flat/normalized document model that diffs and stores cleanly, and fine-grained React re-rendering (editing one paragraph in a 500-block doc repaints just that block).

## Why this exists

Most rich-text editors either bring their own large dependency tree, or force every "special" piece of content (a dropdown, a date, a mention) onto its own line. This one is built around two ideas:

- **Inline heterogeneous content is a first-class citizen.** A `select` dropdown, a date picker, or an `@mention` chip can sit in the middle of a sentence, mixed with regular text, in one paragraph — not forced onto a block of its own.
- **Fine-grained React re-rendering, no virtual-DOM-for-content-editable fights.** Every block subscribes only to its own data via `useSyncExternalStore`; editing one paragraph in a 500-block document doesn't re-render anything else (see `test/performance/largeDocument.test.jsx` for the regression guard on this).

---

# Getting started

## 1. Install

```bash
npm install noteloom react react-dom
```

## 2. Create an editor

```jsx
import { useEditor, NoteloomEditor } from 'noteloom';

function Editor() {
  const editor = useEditor();
  return <NoteloomEditor editor={editor} />;
}
```

That's the whole thing. `useEditor()` creates a fully wired store (undo/redo included) and both registries pre-populated with every built-in block and inline type; `<NoteloomEditor>` renders it with clipboard, slash/emoji/@-mention menus, the floating format toolbar, keyboard shortcuts, and block-range drag already hooked up. No CSS to import either — see [Styling](#styling--zero-setup-required) below.

## 3. (Optional) pass a starting document, or turn off undo/redo

```jsx
const editor = useEditor({
  doc: myDocumentJSON, // defaults to one empty paragraph
  history: true, // default; false gives a plain EditorStore with no undo/redo
});
```

## 4. Try it / learn by example

```bash
npm run dev:quickstart   # the exact 3 lines above, runnable
```

Then work through the rest of `examples/` in order — each one adds exactly one new idea on top of the last (a custom block, a custom dropdown field, theming, ...). See **[`examples/README.md`](examples/README.md)** for the full list and what each one teaches.

Everything past this point is a reference guide, in two parts:

- **[Basic guide](#basic-guide)** — every built-in feature (styling, custom field types, export, collaboration, offline, ...), all built on `useEditor()`/`<NoteloomEditor>` from step 2 above.
- **[Advanced: the granular API](#advanced-the-granular-api)** — for when you need more control than that gives you (a custom toolbar, a hand-picked subset of blocks, writing a whole new block component). `useEditor()` still hands you the raw pieces (`{ store, registry, inlineRegistry }`) to drop into this API — the two are never an either/or choice.

---

# Basic guide

Every example below uses `editor`/`store`/`registry`/`inlineRegistry` from `useEditor()` (`const { store, registry, inlineRegistry } = editor;`) unless it says otherwise.

## Import paths

The basic editor is one import — `import { useEditor, NoteloomEditor } from 'noteloom'` — and nothing below changes that. The heavier, optional features also have their own entry points so a bundler can drop the ones you don't use:

| Import                                     | What's in it                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `noteloom`                                 | the editor, every built-in block/inline type, slash menu, clipboard, undo/redo, export, templates, find & replace, presence |
| `noteloom/theme` (or `noteloom/style.css`) | the default theme stylesheet                                                                                                |
| `noteloom/collab`                          | `CollabSession`, `PeerConnection`, the CRDT primitives, WebSocket signaling                                                 |
| `noteloom/persistence`                     | `usePersistedDocument`, `createAutoPersistence`, the raw IndexedDB ops, `useServiceWorkerUpdate`                            |
| `noteloom/comments`                        | `addComment`/`replyToComment`/…, `useComments`, `CommentsPanel` and the other comment components                            |
| `noteloom/versions`                        | `createAutoVersionHistory`, `VersionHistory`, `diffDocumentsHTML`, `useDocumentVersions`                                    |
| `noteloom/voice`                           | `useVoiceTyping`, `VoicePermissionModal`, `VoiceListeningIndicator`, `listVoiceCommands`                                    |
| `noteloom/canvas`                          | `canvasBlockType` (the freehand-drawing block — the single heaviest component, so it's opt-in)                              |
| `noteloom/starter-kit`                     | `starterKit()`, `defineBlock`, `defineInline`, `registerExtensions` — the extension-authoring workflow                      |

Every name in those feature entries is **also still exported from `noteloom`** itself, so existing imports keep working unchanged. Prefer the subpath in new code — the main-entry re-exports of these will be removed in a future major version (see `docs/repackaging-plan.md`).

## Built-in block types

`paragraph`, `heading` (h1–h3), `listItem` (bulleted, numbered, to-do, and toggle — with Tab/Shift+Tab nesting and standard Enter conventions), `table` (with row/column insert/delete), `layout` (multi-column), `divider`, `callout`, `blockquote`, `code`, `toggleHeading`, `button`, and `embed` (image/video/audio/file).

## Built-in inline types

Atomic, non-text content that can be spliced into running text via the slash menu at any cursor position — `select` (with in-editor add/remove-option UI), `date` (native `<input type="date">`), `checkbox`.

There's no separate hardcoded `mention` type — an `@name` chip is just an ordinary use of `createSelectFieldType` (see [Custom dropdown / mention field types](#custom-dropdown--mention-field-types-static-or-dynamicapi-backed) below), with `triggers: ['slash', 'at']` so it also shows up under a second, dedicated "@" trigger (`useAtMenuTrigger`), alongside "/".

## Styling — zero setup required

You don't need to import any CSS. The moment `<NoteloomEditor>` mounts, it injects a single `<style>` tag with a minimal, clean default theme — no `import 'noteloom/style.css'` line, no build-tool CSS configuration, nothing to wire up. It's idempotent (mounting more than one editor on a page only injects it once) and client-only (a no-op under SSR; hydrate as normal and it injects on mount).

**Retheme it** by overriding the CSS custom properties it reads from — defined on `:root` (not scoped to a wrapper element, since portaled pieces like the slash menu and Select's popover aren't DOM descendants of the editor itself):

```css
:root {
  --noteloom-accent: #16a34a; /* swap the indigo accent for green */
  --noteloom-radius-md: 4px; /* sharper corners */
  --noteloom-font: 'Inter', sans-serif;
}
```

Dark mode follows `prefers-color-scheme` automatically; to control it explicitly instead (e.g. a manual light/dark toggle), set `data-theme="dark"` or `data-theme="light"` on any ancestor (typically `<html>`) — see the full variable list in `src/style.css`. (`examples/04-styling/` is a complete runnable version of everything in this section.)

**Scope overrides to one editor instance**, or add your own class for full custom CSS, via `className`/`style` — passing either wraps the editor surface in one `<div className="be-root ...">`:

```jsx
<NoteloomEditor editor={editor} className="my-editor" style={{ '--noteloom-accent': '#16a34a' }} />
```

No wrapper `<div>` is added unless you pass one of these props, so existing usage is unaffected either way.

**Opt out entirely** with `theme="none"` — nothing gets injected, and you take full responsibility for styling every `.be-*` class yourself (or import `noteloom/style.css` manually if you just want control over _when_ it loads, e.g. before your own overrides in a specific `<link>` order):

```jsx
<NoteloomEditor editor={editor} theme="none" />
```

`examples/basic/src/style.css` shows the extra page-level chrome (fonts, page width, the demo's own toolbar buttons) a host app typically adds around the editor — none of that is part of the default theme itself.

**Customize individual blocks**, not just the root, via `getBlockClassName`:

```jsx
<NoteloomEditor
  editor={editor}
  getBlockClassName={(block) => (block.type === 'callout' ? 'my-callout' : undefined)}
/>
```

Whatever string you return is appended onto that block's own root element's class list (`be-paragraph my-callout`, alongside the fixed base class) — `block` is the real block object (`type`, `id`, `props`), so you can target a type, a specific id, or a prop value (e.g. every red callout) as precisely as you like.

## Picking only the blocks/inline types you want

`useEditor()` registers every built-in block/inline type by default — the fastest way to a fully-featured editor. If you'd rather ship only what you actually use, every built-in block/inline type is also exported individually, and `registerBlocks`/`registerInlineTypes` register just the ones you name, via `useEditor()`'s own `registerBlocks`/`registerInlineTypes` options:

```jsx
import {
  useEditor,
  NoteloomEditor,
  registerBlocks,
  paragraphBlockType,
  headingBlockType,
  TABLE_BLOCKS,
} from 'noteloom';

function Editor() {
  const editor = useEditor({
    registerBlocks: (registry) =>
      registerBlocks(registry, {
        paragraph: paragraphBlockType,
        heading: headingBlockType,
        ...TABLE_BLOCKS,
      }),
  });
  return <NoteloomEditor editor={editor} />;
}
```

`registerBuiltInBlocks(registry)` (what `useEditor()` calls by default) is itself just `registerBlocks(registry, { paragraph: paragraphBlockType, ... })` with every type included — so mixing "give me everything" and "just these few" across different parts of your app is never an either/or choice. `layout`/`table` each need their own group of related types registered together — see `LAYOUT_BLOCKS`/`TABLE_BLOCKS`. `TABLE_SELECT_INLINE_TYPES` (inline side) is only needed if you use a table's "select" column type.

To keep every built-in type **and** add your own on top, call `registerBuiltInBlocks` yourself inside the callback:

```jsx
import { useEditor, NoteloomEditor, registerBuiltInBlocks } from 'noteloom';

function Editor() {
  const editor = useEditor({
    registerBlocks: (registry) => {
      registerBuiltInBlocks(registry); // keep everything built-in...
      registry.register('myCustomType', myBlockTypeEntry); // ...plus your own (see "Advanced" below)
    },
  });
  return <NoteloomEditor editor={editor} />;
}
```

`examples/02-custom-block/` is a complete runnable version of this pattern.

### `defineBlock` / `extensions` — the newer way

The `registerBlocks` callback above still works, but the recommended way to author and register a type is now `defineBlock()` / `defineInline()` plus an `extensions` array:

```jsx
import { useEditor, NoteloomEditor, defineBlock, starterKit } from 'noteloom';
// (defineBlock/defineInline/registerExtensions/starterKit are also on `noteloom/starter-kit`)

const rating = defineBlock({
  name: 'rating', // the block `type`
  component: RatingBlock, // your React component, gets { id }
  contentModel: 'void', // 'blocks' (default) | 'runs' | 'void' — sets isLeaf
  defaultProps: { stars: 0 },
  toHTML: (block) => `<div data-stars="${block.props.stars}"></div>`,
  slashCommand: { label: 'Rating', keywords: ['stars'], run: /* … */ },
});

function Editor() {
  const editor = useEditor({
    extensions: [...starterKit(), rating], // every built-in, plus yours
  });
  return <NoteloomEditor editor={editor} />;
}
```

- `starterKit()` is every built-in block + inline type as an array; `starterKit({ exclude: ['canvas'] })` drops some. `useEditor()` with no `extensions` registers exactly this same set.
- Passing `extensions` turns off the automatic built-ins (it's opt-in, like `registerBlocks`) — spread `starterKit()` in if you want them. A `registerBlocks` callback passed alongside `extensions` still runs, on top.
- `defineBlock` validates its config and throws on obvious mistakes (missing `name`/`component`, bad `contentModel`). The result is still a plain registry entry, so `registry.register('rating', rating)` also works.
- `registerExtensions(array, { registry, inlineRegistry })` does the same registration against registries you made yourself.
- `defineExtension({ name, blocks?, inlineTypes?, keymap?, onBeforeInput?, onPaste?, setup? })` is one extension unit for the `extensions` array. Beyond bundling types, it carries **behavior**:

  ```jsx
  import { useEditor, NoteloomEditor, defineExtension, smartQuotes } from 'noteloom';

  const clearFormatting = defineExtension({
    name: 'clear-formatting',
    keymap: {
      'Mod-\\': (ctx) => {
        // ctx: { store, registry, inlineRegistry, container, getBlock, getRun,
        //        getRootId, applyOperation, applyOperations, getSelection,
        //        getCaret, setCaret, subscribe }
        /* …strip marks over ctx.getSelection()… */
        return true; // truthy = handled: preventDefault + don't let built-ins see it
      },
    },
    setup: (ctx) => {
      const stop = ctx.subscribe(() => {
        /* react to every change */
      });
      return stop; // cleanup on unmount
    },
  });

  const editor = useEditor({ extensions: [...starterKit(), smartQuotes(), clearFormatting] });
  ```

  `keymap` keys use `Mod` (Ctrl/Cmd), `Shift`, `Alt`; `onBeforeInput` / `onPaste` get `(ctx, event)` and follow the same "return truthy = handled" rule. `smartQuotes()` and `autoPairBrackets()` are ready-made ones. (Markdown-style "# " → heading rules are still block-coupled and not expressible here yet.)

## Custom dropdown / mention field types (static, or dynamic/API-backed)

`createSelectFieldType(config)` builds a full, ready-to-register inline type from a plain config object — this is how you add your own named dropdown ("Assignee", "Status", "Priority", ...) **without writing a component**:

```jsx
import {
  useEditor,
  NoteloomEditor,
  registerBuiltInInlineTypes,
  createSelectFieldType,
} from 'noteloom';

const statusFieldType = createSelectFieldType({
  type: 'status', // must match the key you register it under
  label: 'Status', // shown in the "/" menu and as the search box's aria-label
  placeholder: 'Set status…',
  variant: 'tag', // 'tag' = colored pill; 'default' = plain bordered dropdown
  options: [
    { value: 'todo', label: 'To do', color: { bg: '#e9e9e7', text: '#37352f' } },
    { value: 'doing', label: 'In progress', color: { bg: '#fdecc8', text: '#a06400' } },
    { value: 'done', label: 'Done', color: { bg: '#dbeddb', text: '#2f7a2f' } },
  ],
});

function Editor() {
  const editor = useEditor({
    registerInlineTypes: (inlineRegistry) => {
      registerBuiltInInlineTypes(inlineRegistry);
      inlineRegistry.register('status', statusFieldType);
    },
  });
  return <NoteloomEditor editor={editor} />;
}
```

`examples/03-custom-field-type/` is a complete runnable version of this pattern.

Inserting one from "/" or "@" opens its picker immediately, focused and ready to search — no second click needed to actually pick something right after inserting it. Picking a value then moves focus straight on to the next block, so filling in a form-like document ("Diagnosis: [pick]", then the next line, then the next...) is a smooth insert → pick → keep-typing flow. Reopening an _existing_ chip elsewhere to change its value later doesn't also jump away — this only applies right after a fresh insertion.

`options` can also be a **function** instead of a plain array — `(query) => Option[] | Promise<Option[]>` — for a real database/API-backed search (React Select's `loadOptions`, essentially):

```js
createSelectFieldType({
  type: 'assignee',
  label: 'Assignee',
  placeholder: 'Assign to…',
  variant: 'tag',
  triggers: ['slash', 'at'], // reachable via "/assignee" AND by typing "@" directly
  options: async (query) => {
    const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
    const users = await res.json();
    return users.map((u) => ({ value: u.id, label: u.name }));
  },
});
```

A few things worth knowing about the dynamic path:

- Your function is called **fresh on every keystroke**, debounced ~250ms — there's no built-in caching layer, so if you want caching, memoize inside your own function.
- Only the **resolved pick** — `{ value, label }` (plus `color` for the tag variant) — is ever written onto the document. The live options list itself is never persisted, so a chip never embeds a stale snapshot of your database; re-opening it always calls your function again.
- `triggers` (default `['slash']`) decides whether the type shows up under `/`, `@` (via `useAtMenuTrigger`), or both. A field that doesn't read naturally after "@" (e.g. "Priority") should usually stay slash-only.
- A **static** array works just as well when it comes from a JSON file — `import options from './options.json'` (or fetch it once at setup) is already a plain array by the time it reaches `options`, no special handling needed. A hybrid of both ("show a local list, search an API once the user types") is just a function that returns the static list for an empty query and calls your API otherwise — the same debounce applies regardless of what the function does inside.
- The option list itself is **virtualized** — only the rows currently scrolled into view are ever mounted, so a list of thousands of options (static or a big resolved page) scrolls smoothly, same as a list of ten.

### Letting end users create their own field types, in-editor

The above is for types **you** define in code. If you also want a non-technical end user to be able to create new (always static — there's no way to author a fetch function through a UI) select types from inside the editor itself, mount `FieldTypeEditorModal` once and wire a button to it, anywhere inside `<NoteloomEditor>` (as `children`, or in your own chrome around it via `useFieldTypeEditor`):

```jsx
import { NoteloomEditor, FieldTypeEditorModal, useFieldTypeEditor } from 'noteloom';

function NewFieldTypeButton() {
  const { openCreate } = useFieldTypeEditor();
  return <button onClick={openCreate}>+ New field type</button>;
}

<NoteloomEditor editor={editor}>
  <NewFieldTypeButton />
  <FieldTypeEditorModal />
</NoteloomEditor>;
```

User-created types are persisted in the document's own `fieldTypes` collection (so they survive reload) and are automatically rehydrated back into your inline registry by `FieldTypeEditorModal` itself — you don't need to call anything extra. Each chip's popover also gets a "Manage options…" entry that reopens this same modal, pre-filled, for renaming/editing/deleting the type it belongs to.

Once at least one is created this way, a table column set to "Select" type gets a **"Copy options from…"** dropdown in its own menu (alongside its usual "+ New field type" button) — pick one to seed the column's option list from it in one shot, instead of typing the same options out again by hand. It's a one-time copy, not a live link: renaming/adding/removing options on the column afterward never touches the source field type.

## Exporting the document (JSON / HTML / Markdown / Word / PDF / plain text)

```js
import {
  exportDocumentJSON,
  exportDocumentHTML,
  exportDocumentMarkdown,
  exportDocumentWordHTML,
  exportDocumentText,
} from 'noteloom';

exportDocumentJSON(store); // a JSON *string* — JSON.parse() it to get { version, rootId, blocks, runs }, usable as useEditor({ doc })
exportDocumentHTML(store, registry, inlineRegistry);
exportDocumentMarkdown(store, registry, inlineRegistry); // headings, bold/italic/strike/code/links, lists (incl. GFM task lists), quotes, fenced code, tables
exportDocumentWordHTML(store, registry, inlineRegistry); // exportDocumentHTML wrapped with the Word MSO namespace — save with a .doc extension and Word opens it directly
exportDocumentText(store, registry, inlineRegistry);
```

Or mount the ready-made button + modal instead of wiring your own UI:

```jsx
import { DocumentExportButton } from 'noteloom';

<DocumentExportButton label="View source" />;
```

It opens a modal with JSON/Simple JSON/HTML/Markdown/Text tabs (reading live from the store every time it opens), a Copy button, and two direct-download actions:

- **Print / Save as PDF** — calls the browser's own `window.print()`; "Save as PDF" is a standard destination in every major browser's print dialog, and the editor's own `@media print` stylesheet already hides all editor-only chrome (toolbars, menus, this modal itself), so what prints is just the document content. No PDF-writing code of any kind, in keeping with this package having zero runtime dependencies.
- **Download Word (.doc)** — downloads `exportDocumentWordHTML`'s output with a `.doc` extension. Not a real `.docx` (that's a zip of XML files, and hand-writing a zip container is out of scope for this package) — Word opens Word-flavored HTML saved as `.doc` directly via MIME sniffing, a well-known, dependency-free trick.

Useful for debugging, or as a starting point for a real "export" feature.

### A simpler JSON shape for storage/API/CRUD use

`exportDocumentJSON()` above returns the _internal engine format_ — the same normalized, id-referenced graph `EditorStore` operates on (blocks reference other blocks by id; text lives in a separate `runs` collection, not embedded inline). That shape is what makes per-run reactivity, O(1) structural edits, and real nesting (toggle lists, tables, inline atomic chips) work — it's not going to look like a simple flat document, on purpose.

If you just want something simpler to store, send over an API, or hand-edit — self-contained blocks in an array, `children` for nesting, no id-references to resolve — use the second, optional export/import pair instead:

```js
import { exportDocumentSimpleJSON, importDocumentSimpleJSON } from 'noteloom';

const json = exportDocumentSimpleJSON(store, registry, inlineRegistry);
// {
//   "version": 1,
//   "blocks": [
//     { "id": "p1", "type": "paragraph", "data": { "text": "Hello <strong>world</strong>" } },
//     { "id": "h1", "type": "heading", "data": { "text": "Key features", "level": 3 } },
//     {
//       "id": "li1", "type": "listItem",
//       "data": { "text": "Nested item", "ordered": false, "checked": null },
//       "children": [ /* nested listItem blocks, same shape */ ]
//     },
//     {
//       "id": "t1", "type": "table",
//       "data": { "columns": [{ "id": "c1", "label": "Name" }], "rows": [["Cell text"]] }
//     }
//   ]
// }

// ...later, or on a different machine/process:
const doc = importDocumentSimpleJSON(json, registry, inlineRegistry); // -> { rootId, blocks, runs }
const editor2 = useEditor({ doc }); // or `new EditorStore(doc)` directly outside React
```

Rich text (`data.text`) is an HTML string — the exact same per-run serialization every block type's own clipboard-copy `toHTML` already produces, so marks (bold/italic/underline/strike/code/sub/superscript/color/highlight/link) and atomic inline chips (checkbox/date/select/mention) round-trip through it the same way copy/paste already does. `table` is flattened specially (`data.columns` + `data.rows`, a 2D array) rather than exposing the internal table/row/cell block chain — the single biggest simplification versus the internal shape. Block/run ids are preserved on both export and import (useful for referencing/updating a specific block from an external system).

One existing, by-design limitation carried over from clipboard paste: an atomic inline type's _core_ value round-trips (a checkbox's checked state + label, a date's ISO value, a select's chosen value + label) but its full `options` list does not — only the currently-selected option survives, the same as pasting one of these chips into another instance of the editor today.

This is purely an additive, alternate _interchange_ format — the internal engine format above is unaffected either way, and this is not a replacement for it.

## Templates

Two kinds — a **document template** seeds a whole new editor (`useEditor({ doc })`), a **block template** is a saved snippet insertable anywhere via "/". Both are developer-definable in code and end-user-creatable/persisted (IndexedDB, alongside `usePersistedDocument`'s own storage but a separate object store — a template isn't tied to any one document). `examples/05-templates/` is a complete runnable app combining every piece below.

**Block templates — reusable snippets, insertable via "/":**

```js
import {
  EditorStore,
  captureBlockTemplate,
  registerBlockTemplates,
  registerBuiltInBlocks,
} from 'noteloom';

// Build once (a throwaway store is fine — only its content is captured):
const draftStore = new EditorStore({
  rootId: 'root',
  blocks: [
    { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'li1'], props: {} },
    { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 2 } },
    {
      id: 'li1',
      type: 'listItem',
      parentId: 'root',
      contentIds: [],
      props: { ordered: true, titleRunIds: ['r2'] },
    },
  ],
  runs: [
    { id: 'r1', type: 'text', value: 'Meeting agenda', marks: {} },
    { id: 'r2', type: 'text', value: 'Review previous action items', marks: {} },
  ],
});
const agendaSnippet = captureBlockTemplate(draftStore, ['h1', 'li1']);

const editor = useEditor({
  registerBlocks: (registry) => {
    registerBuiltInBlocks(registry);
    registerBlockTemplates(registry, [
      { id: 'agenda', label: 'Meeting agenda', keywords: ['agenda'], roots: agendaSnippet.roots },
    ]);
  },
});
```

Typing "/agenda" now shows "Meeting agenda" in the slash menu, same as any built-in block — no changes needed to `SlashMenu`/`useSlashMenuTrigger`, since `registerBlockTemplates` registers under the hood exactly the way a real block type does (just one that's never actually rendered — only its _captured content_, which already has real block types, gets inserted). `insertBlockTemplate(store, template, { parentId, index })` does the same insertion directly, if you want a button instead of/alongside "/".

**Document templates — starter documents:** no new primitives needed — a document template _is_ a `DocumentJSON`, so `useEditor({ doc: someTemplate.doc })` already covers "start a new editor from it." To apply one to an **already-mounted** editor instead, use `applyDocumentTemplate(store, doc)`.

**Saving/browsing a library of templates** (either kind), persisted so it survives reload:

```jsx
import {
  useEditor,
  NoteloomEditor,
  useTemplates,
  TemplatePicker,
  saveTemplate,
  exportDocumentJSON,
} from 'noteloom';

function NewDocumentScreen({ onPick }) {
  const { templates, isLoaded } = useTemplates({ scope: 'document' }); // or 'block', or omit for both
  if (!isLoaded) return <p>Loading…</p>;
  return <TemplatePicker templates={templates} onSelect={(template) => onPick(template.doc)} />;
}

// Saving the current document as a reusable template:
async function saveCurrentAsTemplate(store, name) {
  await saveTemplate({
    id: crypto.randomUUID(),
    scope: 'document',
    name,
    doc: JSON.parse(exportDocumentJSON(store)), // exportDocumentJSON returns a JSON *string* — parse it first
  });
}
```

`TemplatePicker` is deliberately just a plain list (name + description + a "Use" button) — wrap it in the exported `Modal` component yourself, or render it inline, whichever fits; what `onSelect` actually does (apply it, insert it, just read `.doc`) is up to you, since that differs by scope. `saveTemplate`/`loadTemplate`/`deleteTemplate`/`listTemplates` are the raw storage operations `useTemplates` is built on, for anywhere the hook's all-in-one behavior doesn't fit.

**Importing a template from a file** — since a stored template is already plain JSON, this needs no new format or function, just `saveTemplate(JSON.parse(fileText))`:

```jsx
async function handleImport(event) {
  const template = JSON.parse(await event.target.files[0].text());
  await saveTemplate(template);
}
```

(Exporting one for sharing is the mirror image — `JSON.stringify(template)`, downloaded as a `.json` file — ordinary front-end code, not something this package needs to provide.)

## Comments

Select a range, leave a comment on it; click or hover the highlighted text later to view/reply/resolve/delete it — `examples/06-comments/` is a complete runnable app. Two ways to wire it up:

### The built-in UI (zero comment-authoring code of your own)

Pass `commentAuthorId` — the current user's id — to `<NoteloomEditor>` and the whole experience just works, Notion/Google Docs-style:

```jsx
<NoteloomEditor editor={editor} commentAuthorId={currentUser.id} showCommentsPanel />
```

- The floating format toolbar's Comment button opens a small inline composer (a textarea, matching the rest of the toolbar's minimal chrome) and creates the comment on submit.
- Clicking (or hovering) any highlighted comment opens a popover right there with the thread's messages and Reply/Resolve/Delete — mirroring how the existing link hover card works, just triggered by click too, not hover alone.
- `showCommentsPanel` (optional) adds a right-side panel listing every thread in the document, unresolved first — the "extra feature" for apps that want a persistent overview alongside the inline popovers, not instead of them. It's `position: fixed` by default (see `.be-comments-panel` in style.css) so it needs no layout changes on your end; override that rule for a different placement.

Every reply/new-comment composed through any of these built-in surfaces is attributed to `commentAuthorId`. Omit it and the toolbar's Comment button disappears, the click/hover popover on existing comments still works (viewing/resolving/deleting need no identity) but hides its Reply composer, and `showCommentsPanel` still lists threads read-only in the same way.

For the granular API, render the pieces yourself anywhere under an `<EditorProvider commentAuthorId={currentUser.id}>`: `<FloatingToolbar commentAuthorId={...} .../>` for the toolbar button, `<CommentsPanel authorId={...} />` for the sidebar — the click/hover popover (`CommentPopover`) is mounted automatically inside every block's editable content, same as the link hover card, so there's nothing extra to render for it.

### Full control (bring your own UI)

Pass `onComment` instead of `commentAuthorId` — it's called with the selected range and you decide what happens next (open your own modal, pick the author yourself):

```jsx
import {
  addComment,
  replyToComment,
  resolveComment,
  deleteComment,
  useComments,
  resolveMultiRunSelection,
} from 'noteloom';

<NoteloomEditor
  editor={editor}
  onComment={(range) => {
    const text = window.prompt('Comment text?');
    if (text) addComment(editor.store, range, { authorId: currentUser.id, text });
  }}
/>;

// Outside the floating toolbar entirely, resolve the selection yourself:
function AddCommentButton({ store }) {
  function handleClick() {
    const range = resolveMultiRunSelection(); // { blockId, startRunId, startOffset, endRunId, endOffset }
    if (!range) return; // no non-collapsed selection
    addComment(store, range, { authorId: currentUser.id, text: 'Can we tighten this up?' });
  }
  return <button onClick={handleClick}>Add comment</button>;
}

// A hand-rolled list, using useComments() directly instead of CommentsPanel/CommentThreadCard:
function CommentsSidebar({ store }) {
  const comments = useComments();
  return (
    <ul>
      {comments.map((thread) => (
        <li key={thread.id}>
          {thread.messages.map((m) => (
            <p key={m.id}>
              {m.authorId}: {m.text}
            </p>
          ))}
          <button
            onClick={() =>
              replyToComment(store, thread.id, { authorId: currentUser.id, text: '...' })
            }
          >
            Reply
          </button>
          <button onClick={() => resolveComment(store, thread.id, !thread.resolved)}>
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button onClick={() => deleteComment(store, thread.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

`onComment` (given to `<NoteloomEditor>` or `<FloatingToolbar>` directly) always takes priority over `commentAuthorId`'s built-in composer, so the two can't fight over the same button. The Comment button only appears for a same-block selection either way — `addCommentMarkOverRange` doesn't support a cross-block range yet, the same single-block scope every mark-toggle command already has for its own splitting logic.

A comment thread is `{ id, blockId, anchorRunIds, resolved, messages: [{ id, authorId, text, createdAt }] }`. `CommentThreadCard`/`CommentComposer` (the pieces `CommentPopover`/`CommentsPanel` are built from) are exported too, for reusing the built-in look while customizing the surrounding layout.

**Scope, stated plainly:** a thread's own metadata (text, author, replies, resolved flag) is fully collaboration-aware — it broadcasts live to connected peers and undoes/redoes normally. The _highlighted range_ it's anchored to is local-only in collaboration for v1: a newly-joining peer sees it correctly (full document snapshots always include it), but an already-connected peer won't see someone else's brand-new highlight appear live until their next resync. This isn't a new gap introduced by comments — every other range-based formatting operation (bold, italic, highlight, ...) already has this exact scope today, since none of them have a CRDT-safe wire representation yet.

`thread.anchorRunIds` is a creation-time hint only, meant for jumping to roughly where a comment was made — it is **not** re-validated after a later formatting edit splits or re-mints run ids in that range. To reliably find where a comment's highlight actually lives right now, look at which runs' `marks.commentIds` include it (exactly what `deleteComment` itself does internally via `removeCommentMarkEverywhere`), not `anchorRunIds`.

## Version history

Google Docs-style — there's no "type a label and save" step. Point-in-time document snapshots (stored in IndexedDB, a third object store alongside `usePersistedDocument`'s `documents` and Templates' `templates`) are captured automatically after each burst of edits settles down, each one attributed to whoever made the changes. `examples/07-version-history/` is a complete runnable app.

```jsx
import { useEditor, NoteloomEditor, VersionHistory } from 'noteloom';

const editor = useEditor({ currentUserId: currentUser.id }); // stamps every edit's author, see below

<NoteloomEditor editor={editor}>
  <VersionHistory docId={docId} />
</NoteloomEditor>;
```

That's the whole integration. `<VersionHistory>` is self-contained: it renders the "Version history" button, and for as long as it's mounted it also quietly captures snapshots in the background — no separate wiring needed. Clicking the button opens a drawer (matching the built-in Comments UI's own design language) listing every version grouped by day, each showing an avatar, author, relative time, and a lightweight summary ("3 blocks changed"); clicking one opens it on a **Changes** tab — a word-level diff against the version right before it, insertions highlighted green, deletions struck through in red, Google Docs "show changes"-style — with a **Preview** tab alongside for a plain read-only render, and a "Restore this version" button.

**Attribution** — `currentUserId` (passed to `useEditor()`, or `history.setDefaultActorId(id)`/`new History(store, { defaultActorId })` for the granular API) is stamped as every edit's `actorId` automatically; `VersionHistory`/`createAutoVersionHistory` read it straight off the history log, no separate identity plumbing required. Omit it and versions still get created, just with `authorId: null` (shown as "Unknown").

**Tuning the capture window** — `<VersionHistory docId idleMs={5 * 60 * 1000} maxVersions={200} />`: `idleMs` (default 5 minutes) is how long edits need to pause before a version is closed and saved (a smaller value in the example app, so you don't have to actually wait); `maxVersions` prunes the oldest versions beyond that count. For the granular API, or to save an explicit snapshot right before some risky action, use `createAutoVersionHistory({ store, docId, idleMs?, maxVersions? })` directly — it returns `{ stop, flush }`; `flush()` closes and saves the current window immediately instead of waiting for the idle gap (e.g. right before navigating away).

Restoring needs no new function — it's the exact same `applyDocumentTemplate(store, doc)` Templates already uses to wholesale-replace a live editor's content, which is what the drawer's own Restore button calls. `saveDocumentVersion`/`loadDocumentVersion`/`deleteDocumentVersion`/`listDocumentVersions` are the raw storage operations everything above is built on, for anywhere the built-in UI doesn't fit; `useDocumentVersions(docId)` is the reactive hook if you want to build your own list instead of `<VersionHistory>`; `diffDocumentsHTML(prevDoc, nextDoc)` is the diffing function behind the Changes tab (pass `null` as `prevDoc` to mark everything as newly added), for building a custom diff view instead.

## Right-to-left / multi-language text

Every block defaults to `dir="auto"` — the browser's own Unicode bidi algorithm detects direction per block from its first strong character, so a document mixing LTR and RTL blocks (an English heading over an Arabic paragraph, say) just works with zero configuration. For the cases `auto` can't infer on its own (most commonly an empty block, which has no text yet to detect a direction from), set an explicit override:

```js
import { operations } from 'noteloom';

// Document-wide default:
store.applyOperation(operations.updateBlockProps(store.getRootId(), { dir: 'rtl' }));
// Or just one block:
store.applyOperation(operations.updateBlockProps(blockId, { dir: 'rtl' }));
```

A block's own `dir` wins over the document's; the block gutter menu also has a "Switch to right-to-left"/"left-to-right" item that sets this per-block. Code blocks are always `dir="ltr"` regardless of the surrounding document's default — code syntax (brackets, operators) is structurally LTR no matter what language a comment or string literal happens to be written in.

This pass covers the reading/typing/gutter-position direction itself; a full logical-properties (`margin-inline-start` etc.) audit of every pixel value in `style.css` is deliberately out of scope for now — the highest-impact pieces (list/checkbox marker position, blockquote border side, block gutter position) already flip correctly.

## Find & replace

Built into `<NoteloomEditor>` — Ctrl/Cmd+F, while the editor has focus, opens a find bar with a live match count, Previous/Next (wraps around), Match case / Whole word toggles, and an optional Replace/Replace All row. Only intercepts the shortcut while this editor has focus, so a host page's own native browser find elsewhere on the page is untouched.

Matches are scoped to a single text run — a search term split across a formatting boundary (e.g. half bold, half plain) or landing inside a non-text run (a select/date/mention chip) won't be found. Highlighting uses the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) rather than inserting elements into the document — it paints purely at the rendering layer, so it can never interfere with the editor's own precise contentEditable-to-data sync. Older Firefox (no support for that API) still gets fully working search/navigate/replace, just without the visual highlight.

Building custom find UI, or using the granular API:

```jsx
import { useFindInDocument, FindBar, findMatches, replaceAllMatches } from 'noteloom';

// Drop-in bar, same one NoteloomEditor already wires up:
function MyEditorSurface({ containerRef }) {
  const find = useFindInDocument(containerRef);
  return <FindBar {...find} />;
}

// Or work with matches directly, headless:
const matches = findMatches(store, 'hello', { caseSensitive: false, wholeWord: false });
replaceAllMatches(store, matches, 'hi');
```

## Table sort, filter & footer aggregates

Every table's column menu (the "⋮" trigger on each header cell) gains three extra tools, no configuration needed:

- **Sort ascending / Sort descending** — a real, one-time row reorder (like a spreadsheet's "Sort A→Z"), type-aware per column (text sorts case-insensitively and numerically when the values look like numbers, date by its actual date, checkbox unchecked-before-checked, select by its label). Blank cells always sort to the end. It's undoable like any other edit, but not a continuously-reapplied live view — editing a cell afterward doesn't re-trigger the sort.
- **Filter** — a text box; rows not containing the query are hidden from view. This is local, ephemeral UI state: nothing is written to the document, nothing syncs to collaborators, and it resets on reload — the real content is completely untouched, the same way `usePreviewMode`'s own "Hide in preview" is a display concern, not a data one.
- **Footer aggregate** — Count / Count filled / Count empty / Sum / Average / Min / Max, shown in a footer row, recomputed from whatever rows are currently visible (so it reflects an active filter). There's no formula/expression engine behind this — deliberately out of scope for a zero-runtime-dependency package with no sandboxed code-execution story — `sum`/`average`/`min`/`max` just parse each cell's own plain text as a number and skip whatever doesn't parse, so a plain "text" column full of numbers aggregates correctly without needing a dedicated "number" column type.

```js
import { sortTableByColumn, setColumnAggregate, computeColumnAggregate } from 'noteloom';

sortTableByColumn(store, tableId, colIndex, 'asc', inlineRegistry);
setColumnAggregate(store, tableId, colIndex, 'sum'); // persisted column metadata — which aggregate to show
computeColumnAggregate(runs, columnType, 'sum', inlineRegistry); // the actual computed value, given the runs you want to include
```

## Printing & PDF

`style.css` includes a built-in `@media print` stylesheet: every piece of editing chrome (the block gutter, all portaled menus, the floating toolbar, resize handles, the find bar, the mobile action bar, etc.) is hidden automatically, and a block hidden via "Hide in preview" stays hidden in the printout too, regardless of whether the app happens to be toggled into preview mode at the moment you print — printing always behaves like preview mode.

There's no bundled PDF-generation library (that would need a real dependency like jsPDF/pdfmake, conflicting with staying zero-runtime-dependency) — the browser's own print-to-PDF is the intended path:

```js
window.print(); // Ctrl+P / Cmd+P works too — "Save as PDF" in the print dialog is your PDF export
```

(`DocumentExportButton`'s own "Print / Save as PDF" button, see the exporting section above, is exactly this call.)

This only cleans up the _editor's_ own chrome. A host app's own outer UI (nav bar, sidebar, its own toolbar) needs its own `@media print` rules the same way — see `examples/basic/src/style.css` for a worked example, since that chrome lives entirely outside this package.

## Voice typing

`useVoiceTyping()` wraps the browser's native Web Speech API (`SpeechRecognition`) for continuous dictation mixed with spoken structural commands — say "heading one", "new paragraph", "bulleted list", "quote", "undo", etc. while dictating, and the current block converts (or a new one is inserted) instead of those words being typed as text:

```jsx
import { useVoiceTyping } from 'noteloom';

function MicButton() {
  const voice = useVoiceTyping();
  if (!voice.isSupported) return null; // e.g. Firefox — no bundled fallback, degrades to nothing
  return (
    <button onClick={() => (voice.isListening ? voice.stop() : voice.start())}>
      {voice.isListening ? 'Stop dictation' : 'Start dictation'}
    </button>
  );
}
```

No speech-to-text SDK is bundled (same zero-runtime-dependency reasoning as PDF export above) — this is built entirely on the browser's own `SpeechRecognition`/`webkitSpeechRecognition`, so `isSupported` is `false` wherever that API doesn't exist. A command is only recognized when an entire _finalized_ spoken utterance (a natural pause before/after, as reported by the Speech API itself) matches a known phrase exactly — see `src/voice/voiceCommands.js` for the full table — so a command word merely mentioned mid-sentence while dictating prose is never misread as a command.

## Mobile / touch support

Typing "/"/"@" still works on a phone keyboard, but it's not a reliable or discoverable primary path there (autocorrect, awkward key access, nothing to discover it by) — so on a coarse (touch) pointer, `MobileActionBar` takes over as the touch-first equivalent, pinned above the on-screen keyboard. It needs direct access to the same DOM element your editor surface renders into (to track focus/selection inside it), which `<NoteloomEditor>` doesn't expose — so this one piece needs the [granular API](#advanced-the-granular-api):

```jsx
import { MobileActionBar } from 'noteloom';

// next to your other trigger hooks/components, same containerRef:
<MobileActionBar containerRef={containerRef} />;
```

`examples/basic` has this fully wired up (run `npm run dev`, then resize to a narrow viewport or open it on a phone).

It renders nothing on a mouse/trackpad, and nothing until focus is actually inside the editor. Its contents swap based on context:

- **Block options** (shown whenever the caret/selection is inside any block) → Duplicate/Move up/Move down/Hide-Show/Delete, in `MobileBlockOptionsSheet` — the mobile home for the desktop per-block gutter's own grip-handle menu. The gutter itself is hidden entirely on touch input (no hover state exists to reveal it by, and its desktop position sits in a page margin that doesn't exist on a narrow viewport), so both of its actions ("+" and the options menu) live in this bar instead of the gutter on touch.
- **Text selected** → formatting actions (bold/italic/underline/link) — the desktop `FloatingToolbar` bubble also disables itself on touch, so this is the single formatting surface either way (both share the same `useTextFormattingActions` hook, not two copies).
- **Collapsed caret, table cell** → insert row/column.
- **Collapsed caret, code block** → language picker.
- **Collapsed caret, callout** → color picker.
- **Collapsed caret, everywhere else** → "+" (opens `MobileBlockPickerSheet`, a tap-friendly bottom sheet listing every insertable block, same commands "/" already offers), Undo/Redo, dismiss-keyboard.

Trigger-menu and `Select` popovers reposition above the caret instead of below it when there isn't room before the keyboard, via `useVirtualKeyboardInset()` (also exported, in case you're positioning your own UI against the keyboard).

**Touch detection deliberately isn't a static `matchMedia('(pointer: coarse)')` check** (see `useCoarsePointer`, also exported) — a touchscreen laptop reports its trackpad as the "primary" pointer even though the touchscreen sitting right there can be used at any moment, so a pure media-query check would never show touch UI on that class of device. Instead, the media query only supplies the _initial_ guess (correct pre-interaction, SSR-safe); every real `pointerdown` afterward overrides it with that event's own `pointerType`, so a 2-in-1 laptop correctly shows desktop UI while the trackpad is in use and mobile UI the instant the screen is tapped, live, no reload needed. The same signal is mirrored onto `<html class="be-touch-input">` so plain CSS (the gutter-hiding rule above) reacts to it too, not just `MobileActionBar` itself.

**Not included**: a touch equivalent for dragging in the block gutter to select a range of blocks — most block editors keep that gesture desktop/mouse-only too.

## Accessibility

- Every portaled popover that's a genuine standalone action menu (the block gutter's Duplicate/Move/Hide/Delete menu, the block-range action menu, a table column's options menu) is keyboard-operable: opening one moves real focus onto its first item, ArrowUp/ArrowDown move between items (wrapping), Home/End jump to the first/last, and Escape closes it and returns focus to whatever opened it — not just a name-only `role="menu"` that only responds to mouse clicks.
- `Modal` moves focus into the dialog (its first focusable element) on open and restores it to whatever had focus before on close — not a full focus trap (this package stays zero-dependency, and its dialogs are short, single-purpose forms, not deep navigable UI), just "focus doesn't go missing."
- Structural actions that don't otherwise move focus anywhere describable (duplicate/move/hide/delete a block, or a whole selected range) announce what happened via a shared, visually-hidden `aria-live="polite"` region — screen-reader users get "Block deleted"/"3 blocks moved up" instead of silence.
- Embed images have a real, separately-authored `alt` text field (a toolbar button opens a small dialog to set it) — `alt` is never silently filled in from the uploaded file's raw filename or a pasted URL string, since neither is meaningful alt text.
- Table header cells have `scope="col"`, and the column-resize/embed-resize sliders both expose `aria-valuemin/valuemax/valuenow`.

## Offline persistence

For a fully offline editor — no server, no internet required — documents can auto-save to IndexedDB (native browser API, no added dependency) and reload themselves on the next visit:

```jsx
import { useEditor, NoteloomEditor, usePersistedDocument } from 'noteloom';

function App() {
  const editor = useEditor({ doc: myStarterDoc });
  const { isLoaded } = usePersistedDocument({ store: editor.store, docId: 'my-document-id' });

  if (!isLoaded) return <p>Loading…</p>;
  return <NoteloomEditor editor={editor} />;
}
```

On mount, this loads whatever was last saved under `docId` (if anything) and replaces the store's content with it; every edit after that — typing, structural changes, even changes arriving from a collaborating peer via `CollabSession` — is auto-saved back, debounced (default 500ms of quiet) so a full-document write doesn't fire on every keystroke. Different `docId`s are stored independently, so one browser can hold many separate documents (e.g. keyed by page/route). A runnable example is in `examples/offline-persist/` — run `npm run dev:offline-persist`, type something, then reload the page or close and reopen the tab.

Everything already auto-saves, but `usePersistedDocument` also wires up the keyboard shortcut every user reaches for anyway: **Ctrl+S (Windows/Linux) or Cmd+S (Mac)** forces an immediate save (skipping the rest of the debounce window) and blocks the browser's own "Save Page" dialog from popping up instead — pass `{ saveShortcut: false }` to opt out, and `onSave` (fires after every save, shortcut-triggered or manual) to show your own "Saved" feedback. The hook also returns `save()` directly, for a manual Save button:

```jsx
const { isLoaded, save } = usePersistedDocument({
  store: editor.store,
  docId: 'my-document-id',
  onSave: () => showSavedToast(),
});
```

Lower-level pieces, if `usePersistedDocument`'s all-in-one behavior doesn't fit (a non-React host app, custom load/save timing, etc.):

- `savePersistedDocument(docId, doc)` / `loadPersistedDocument(docId)` / `deletePersistedDocument(docId)` / `listPersistedDocumentIds()` — the raw IndexedDB operations `usePersistedDocument` is built on.
- `createAutoPersistence({ store, docId, debounceMs, onError })` — just the debounced auto-save half, if you want to handle the initial load yourself. Returns `{ stop, flush }` — `flush()` returns a Promise that resolves once the write actually lands (or immediately if there was nothing pending).

This is standalone — works with a solo, non-collaborating store just as well as one wired to `CollabSession` (a collaborated-on document also gets saved locally, so it survives even after every peer disconnects). Note this only makes the _editing_ work offline; if the app itself is loaded from a dev server or web host, opening it for the very first time (or after clearing cache) still needs that host to be reachable once — that's the separate concern the next section covers.

### Offline app shell (PWA)

`usePersistedDocument` makes the _document_ offline-capable; it doesn't make the _app itself_ loadable with no network — that needs a service worker precaching the HTML/JS/CSS, which is a build-level concern (the exact list of files to cache is whatever your bundler outputs), not something a runtime library can inject. This package doesn't ship a service worker implementation for that reason — instead:

- Use a standard Vite PWA setup — [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) is the common choice, and requires no noteloom-specific configuration; a working example is in `examples/offline-persist/vite.config.js`.
- `useServiceWorkerUpdate()` (exported from the package) is the one genuinely reusable piece: it watches for a newly-installed service worker sitting in the "waiting" state (the standard signal a fresh build is ready) and gives you a way to activate it —

  ```js
  import { useServiceWorkerUpdate } from 'noteloom';

  function UpdateBanner() {
    const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
    if (!updateAvailable) return null;
    return <button onClick={applyUpdate}>Update available — reload</button>;
  }
  ```

  Works with any service worker registration, however it got there — it only observes, it doesn't register one itself.

Run `npm run dev:offline-persist`, then `npx vite build --config examples/offline-persist/vite.config.js && npx vite preview --config examples/offline-persist/vite.config.js` to try the built (not dev-mode) version — service workers only activate on a real build. Load it once online, then disconnect entirely and reload: the app shell still loads, and editing/persistence both keep working, since IndexedDB has no network dependency of its own.

## File & image uploads

The image/video/audio/file block (`embed`, reachable via "/image", "/video", etc.) ships with zero configuration needed: a picked or dropped file is read straight into a `data:` URL and stored directly in the document. That keeps everything fully self-contained — works offline, round-trips through copy/paste and undo/redo like any other block — at the cost of bloating the document for large media, since this package has no backend of its own to hand a file to instead.

For real upload-to-a-server behavior — local disk, AWS S3, or any other cloud storage — pass `uploadFile` to `<NoteloomEditor>` (or `<EditorProvider>` for the granular API):

```jsx
<NoteloomEditor
  editor={editor}
  uploadFile={async (file, { kind }) => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body });
    const { url } = await res.json();
    return { src: url }; // { name?, mimeType? } also accepted, defaulting to the file's own
  }}
/>
```

A few things worth knowing:

- **AWS S3** (or any presigned-URL-style object storage) is the same shape, just two requests instead of one — ask your own backend for a presigned PUT URL, then `PUT` the file straight to it:
  ```js
  uploadFile: async (file) => {
    const { uploadUrl, publicUrl } = await fetch('/api/s3-presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    }).then((r) => r.json());
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    return { src: publicUrl };
  };
  ```
  Any other cloud storage (Cloudinary, Supabase Storage, R2, GCS, ...) is one of these two shapes — a single API call back with a hosted URL, or a signed-URL handshake — since this package only ever needs the final `{ src }`, not how it got there.
- **Small/medium/large file handling** is entirely `uploadFile`'s own business, off `file.size` (bytes) — this package deliberately hardcodes no byte thresholds of its own, since what counts as "large" varies wildly by app:
  ```js
  uploadFile: async (file) => {
    if (file.size < 200 * 1024) return { src: await inlineAsDataUrl(file) }; // small: keep it simple
    if (file.size < 25 * 1024 * 1024) return uploadToYourServer(file); // medium
    return uploadToS3Multipart(file); // large: chunked/multipart
  };
  ```
- While `uploadFile` is resolving, the block shows an "Uploading…" state; if it rejects, a dismissible error message is shown instead and nothing is written to the document — the file input stays available to try again.
- `maxFileSize` (bytes) only applies to the **built-in, zero-config `data:` URL fallback** — an oversized file is rejected with a clear error instead of silently bloating the document. It has no effect once `uploadFile` is configured, since the host's own function (or backend) is what decides what it can handle.
- `useFileUpload()` exposes the same `{ uploadFile, maxFileSize }` to your own components, for building custom upload UI outside the `embed` block that still honors the same configuration.
- **Pasting** a raw image/media file straight from the OS clipboard (a screenshot, an OS-level "Copy Image") works too, going through this exact same `uploadFile`/`maxFileSize` resolution and inserting an `embed` block — no separate configuration needed. (Copying an already-rendered `<img>`/`<video>`/`<audio>` _from a webpage_ instead reconstructs it from the pasted HTML, unrelated to this upload path.)
- **Rich link embeds**: pasting a YouTube, Vimeo, Loom, Figma, CodePen, or Spotify link into any embed block's URL field (or via the "Embed link" slash command) auto-detects it and renders a real interactive iframe instead of a broken `<img>`/`<video>` tag — no configuration needed, and no network fetch involved (pure URL pattern matching, see `src/blocks/embed/oembedProviders.js`).

## Live collaboration (experimental)

Real-time multi-peer editing, built as a custom **block-tree CRDT** — not a generic text-CRDT library bolted on — so it stays true to the zero-runtime-dependency design. Peers connect directly over WebRTC; you bring your own signaling (a WebSocket relay, Firebase/Supabase realtime, or anything else that can pass small JSON messages between two peers) to bootstrap the connection.

```jsx
import { useEditor, NoteloomEditor, CollabSession } from 'noteloom';
import { useEffect } from 'react';

function App() {
  const editor = useEditor({ doc: myDoc });

  useEffect(() => {
    // `signaling` is any object shaped like SignalingChannel (src/sync/signaling.js):
    // { localPeerId, send(toPeerId, message), onMessage(cb) }
    const session = new CollabSession({ history: editor.store, signaling });
    session.connect(remotePeerId, { initiator: true }); // `initiator: true` on exactly one side of each pair
    return () => session.destroy();
  }, []);

  return <NoteloomEditor editor={editor} />;
}
```

From then on, every edit made via `editor.store` (typing, inserting/moving/deleting blocks, "Turn into" type conversions) is automatically broadcast to connected peers, and incoming changes merge in live.

### Signaling options

`CollabSession` only needs _something_ that can pass small JSON messages between two peers to bootstrap their WebRTC connection — it never needs to touch the internet itself. Two ready-to-use signaling backends:

- **Same-browser demo, zero server** — `examples/collab/` uses the native `BroadcastChannel` API so every tab open on the same machine can find and sync with each other. Run `npm run dev:collab` and open the URL in two tabs. Good for trying the feature out; only works within one browser.
- **Real multi-device collaboration — same WiFi/LAN, no internet required, or over the open internet if you point it at a public host** — `createWebSocketSignaling()` (exported from the package) connects to a small relay server that only ever sees connection-setup messages, never document content:

  ```js
  import { createWebSocketSignaling, CollabSession } from 'noteloom';

  const signaling = createWebSocketSignaling({
    url: 'ws://192.168.1.5:8080', // a relay running on your LAN -- or any host, if you want internet-wide instead
    roomId: 'my-document-id', // anyone using the same roomId ends up in the same room
    peerId: crypto.randomUUID(),
  });
  const session = new CollabSession({ history: editor.store, signaling });

  signaling.onPeerDiscovered((remotePeerId) => {
    const initiator = signaling.localPeerId > remotePeerId; // deterministic tie-break
    session.connect(remotePeerId, { initiator });
  });
  ```

  A minimal reference relay server (Node, `ws`-based, ~80 lines, **not** part of the npm package) lives in `tools/lan-relay-server/` — see its README for how to run it and the wire protocol. A full runnable example wiring it up is in `examples/lan-collab/` — run `npm run dev:lan-collab` (after starting the relay), open the URL in two tabs, and it works with zero internet connectivity as long as both tabs can reach the relay.

### Presence / awareness (live cursors, who's online)

`CollabSession` also carries ephemeral "here's where I am" data alongside the document sync — entirely separate from the document CRDT (never persisted, never merge-conflicted, just "whatever the last message said"):

```js
import { usePresence } from 'noteloom';

// broadcast your own position (throttled automatically, ~100ms by default)
session.setLocalPresence({ runId: caret.runId, offset: caret.offset, name: 'Alex' });

// react to everyone else's, reactively
function PeerCursors({ session }) {
  const presence = usePresence(session); // Map<peerId, data>, re-renders on change
  return [...presence.entries()].map(([peerId, data]) => /* render however you like */);
}
```

What presence _contains_ is entirely up to you — a cursor position, a display name, a color, a "currently viewing" flag — `CollabSession` only relays the data, it never inspects or interprets it. A peer's entry disappears from `usePresence`'s map the instant they disconnect, and a newly-joining peer receives everyone's already-set presence immediately rather than waiting for their next move. `examples/collab/` renders this as live colored carets with peer-id labels, resolving `{runId, offset}` to an on-screen position the same way the editor's own selection code does (via the `[data-run-id]` DOM convention) — see `PeerCursors` in its `App.jsx` for the full (host-app-level, not package-level) rendering logic.

**How conflicts resolve:**

- Concurrent inserts (even at the same position) — both survive, converging to the same order on every peer.
- Concurrent delete vs. edit of the same block — the delete wins.
- Concurrent type-conversion of the same block ("Turn into") — one type wins deterministically (the same one, on every peer), not two duplicate blocks.
- Concurrent edits to a run's text — merge at the _character_ level (a real per-run CRDT, the same ordered-list mechanism blocks already use, just one level down): two peers editing different parts of the same run both survive, and two peers inserting at the exact same position both survive too, interleaved deterministically (identically on every peer) rather than one silently overwriting the other.

### Tombstone garbage collection

Deleted blocks/runs are kept as "tombstones" rather than actually removed — necessary so a concurrent operation that references a since-deleted item (an insert anchored to it, say) can still resolve correctly no matter when it arrives. Left alone, this grows without bound over a long enough session. To actually reclaim that memory:

```js
import { useEditor, createPeriodicTombstoneGC } from 'noteloom';

const editor = useEditor({ doc: myDoc });
const gc = createPeriodicTombstoneGC({
  store: editor.store,
  intervalMs: 60 * 60 * 1000,
  maxAgeMs: 24 * 60 * 60 * 1000,
}); // hourly sweep, 24h retention (both defaults, shown explicitly)

// later, when the store is no longer in use:
gc.stop();
```

Or call `store.pruneTombstones({ maxAgeMs })` yourself on whatever schedule you want — `createPeriodicTombstoneGC` is just a thin timer wrapper around it. `store.getTombstoneCount()` tells you how many are currently being retained, if you want to observe growth before deciding on a policy. Both work identically whether `store` is a plain `EditorStore` or a `History` wrapping one, and pruning is never itself an undo step (it doesn't change the visible document — the pruned content was already invisible).

**Why a time-based threshold is safe here specifically:** this only works because of how `CollabSession` reconnects — a peer rejoining after any absence gets a full document _snapshot_ (`syncResponse`), never a replay of the ops it missed. That means a peer offline longer than the GC threshold never needs an old tombstone to resolve a stale reference; it just adopts the current state directly. The only residual risk is a single _already-connected_ peer somehow stalling for exactly as long as the threshold and then delivering a queued message afterward — implausible for a live, reliable, ordered WebRTC data channel (which disconnects long before that under any real interruption), but not impossible, which is why this is opt-in rather than automatic.

### Reconnecting reliably

`CollabSession`/`createWebSocketSignaling` deliberately don't retry anything themselves (see the class doc comment) — a dropped connection is a transport-layer concern left to the host app, on purpose, so this stays a small library rather than growing an opinionated retry/backoff policy no two apps would agree on. `examples/lan-collab/` is a complete, runnable reference for the two pieces most apps end up needing on top:

- **A watchdog that actually reconnects.** `createWebSocketSignaling` exposes no `close`/`error` event for the relay connection dying silently (a sleeping laptop, a WiFi drop, the relay restarting) — so periodically checking "do I currently have zero live peers, and has it been a while since I last tried" and, if so, tearing down and recreating the whole signaling + session is the only reliable way to notice and recover. Also worth reacting to the browser's own `online` event immediately, rather than waiting for the next timer tick.
- **Actually catching up, not just resuming.** A reconnecting peer that keeps its existing (non-empty) store — the right default, so a solo editing session isn't wiped by a network blip — never re-triggers `CollabSession`'s adopt-a-snapshot path, since that only fires when a store is genuinely empty (see "A peer joining with their own existing document" below). Left alone, this peer silently misses everything the room changed while it was away. The fix: on a genuine _reconnect_ (never the very first connection) where nothing was typed locally in the gap, reset the store back to that same empty shape first — the same field-level reset `usePersistedDocument` uses internally — so the ordinary adopt-on-empty flow does the catching-up. If local edits _were_ made while disconnected, keep them as-is; there's no safe way to both preserve them and adopt someone else's snapshot without a real merge (see the next limitation).

**Known limitations — read before relying on this in production:**

- **Undo is local-only, and only ever touches your own edits.** Undo/redo of a text edit works by tombstoning/restoring the exact character ids _you_ inserted/deleted (not by replaying an old whole-string snapshot), so undoing your own past edit to a run can never remove a peer's concurrent edit to that same run, no matter how they're interleaved. One narrower case remains open: concurrent _formatting_ (bold/italic, which splits a run into new runs with new ids) racing a concurrent _edit_ of the exact same run is a run-list-level (not character-level) concern this doesn't cover.
- **Deleted content isn't garbage-collected automatically, but can be — opt-in.** Tombstones are kept by default (needed so a late-arriving concurrent operation can still resolve correctly), which means unbounded memory growth over a long enough session unless you do something about it. `store.pruneTombstones({ maxAgeMs })` (default 24h) removes tombstones older than that safely — see "Tombstone garbage collection" above. Nothing calls this automatically; wire up `createPeriodicTombstoneGC` (or call it yourself) if you want it handled for you.
- **A peer joining with their own existing (different) document does not merge with yours.** `CollabSession` only adopts a peer's document wholesale when your own side is still empty — the common "open a shared link and get the document" flow. Reconciling two independently-created, already-diverged documents on first contact is a fundamentally harder problem (no shared id space) and isn't attempted. This is also why the reconnect pattern above only ever resets a store that has no unsynced local edits of its own.
- **Reconnecting after a dropped connection re-syncs the full document**, not just what was missed — simple and correct, at the cost of O(document size) traffic per reconnect. See "Reconnecting reliably" above for making the reconnect itself actually happen.
- Only structural block changes and field edits (props, type, run text) are collaboration-aware. A few coarse "resync" operations (`setBlockContentIds`, `replaceRunSpan`, `setBlockRuns` — used for DOM-reconciliation escape hatches like paste-into-contentEditable or IME composition) remain local-only for now.
- Large single messages (e.g. an embedded video/file's `data:` URL, or a full-document `syncResponse` for a big document) are transparently fragmented, flow-controlled against the data channel's own backpressure, and reassembled under the hood — you don't need to do anything for this, but very large embeds mean more individual send calls and somewhat higher latency to fully arrive.

---

# Advanced: the granular API

Everything above is `useEditor()`/`<NoteloomEditor>` — a convenience layer over the pieces below, nothing hidden behind them. This section is for when you need more control than that gives you: a custom toolbar, mobile chrome mounted separately, or a hand-rolled surface element.

## Building the editor by hand

```jsx
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
  SlashMenu,
} from 'noteloom';
import { useMemo, useRef } from 'react';

function Editor() {
  const containerRef = useRef(null);
  const { store, registry, inlineRegistry } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    const store = new History(
      new EditorStore({
        rootId: 'root',
        blocks: [
          { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
          { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        ],
        runs: [
          { id: 'r1', type: 'text', value: 'Hello — try typing "/" for commands.', marks: {} },
        ],
      }),
    );
    return { store, registry, inlineRegistry };
  }, []);

  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  return (
    <EditorProvider
      store={store}
      registry={registry}
      inlineRegistry={inlineRegistry}
      history={store}
    >
      <div ref={containerRef} onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
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
    </EditorProvider>
  );
}
```

See `examples/basic` for a complete working app built this way (run `npm run dev`) — it wires up everything the Basic guide above covers individually (mobile chrome, voice typing, export, field-type management, ...) from these same granular pieces.

## Registering a brand-new block/inline type, from scratch

The [Basic guide](#basic-guide) above covers _picking_ existing types and _configuring_ dropdown/mention field types via `createSelectFieldType` — no component required for either. Writing an entirely new block or inline type (its own React component, HTML/plain-text serialization, its own slash command) is the one thing that's inherently advanced regardless of which path built your registry:

```js
registry.register('myBlock', {
  component: MyBlockComponent, // receives only { id }
  isLeaf: true, // true if contentIds holds run ids, false if it holds child block ids
  toHTML(block, ctx) {
    /* ... */
  },
  fromHTML(domNode, ctx) {
    /* ... or return null if this node isn't yours */
  },
  toPlainText(block, ctx) {
    /* ... */
  },
  slashCommand: {
    label: 'My Block',
    keywords: ['my'],
    run(store, ctx) {
      /* ... */
    },
  },
});
```

`registry` here is `editor.registry` from `useEditor()` (call this inside the `registerBlocks` callback shown in [Picking only the blocks/inline types you want](#picking-only-the-blocksinline-types-you-want)) or a hand-built one from above — both work identically. `examples/02-custom-block/` is a complete, runnable, non-text example (a 5-star rating widget) with comments walking through every field.

---

# Development

```bash
npm install
npm run dev:quickstart   # examples/01-quickstart — useEditor()/<NoteloomEditor>
npm run dev              # examples/basic — the same editor built from the granular API
npm test                 # vitest (jsdom + @testing-library/react)
npm run typecheck        # tsc --noEmit against src/index.d.ts
npm run build            # library build (dist/, ESM + CJS + index.d.ts)
```

See `examples/README.md` for the rest of the runnable examples, and `CONTRIBUTING.md` for the full contributor guide.

## Known limitations

- No accessibility affordance exists for grouping sibling list items under a shared `role="list"` container (each list item is an independent block, not wrapped in one) — adding `role="listitem"` without that ancestor would be worse than no role at all, so it's deliberately left out pending a bigger structural change.
- `<NoteloomEditor>` renders `role="document"`/`aria-label` on its own surface element; if you build the surface yourself via the granular API (no library-rendered root element there — see `examples/basic/src/App.jsx`'s `EditorSurface`), add those attributes yourself the same way.
- Cross-block mark toggling (bold/italic/underline over a selection spanning multiple blocks) applies as one store operation per block, not a single atomic undo step.
- `select`'s option-adding UI and any `createSelectFieldType`-based type's options (e.g. an "Assignee" @-mention) are meant as a starting point — a real app will want to wire its own people/options source.
- RTL support covers direction resolution (`dir="auto"` + per-block/document override) and the highest-impact visual pieces (list markers, blockquote border, block gutter position) — a full logical-properties rewrite of every hardcoded pixel value in `style.css` is a bigger follow-up, not yet done.
- Voice typing (`useVoiceTyping`) only acts on _finalized_ speech results, not interim/in-progress ones, and command detection requires a spoken command to be its own complete utterance — there's no explicit "command mode" trigger (push-to-command, wake phrase) yet, just pause-based auto-detection.
- Automated tests run under jsdom; there is no automated real-browser test suite. If you hit an edge case jsdom can't reproduce (anything involving actual native `contentEditable` browser quirks, or the real Web Speech API), please file an issue with the exact browser/OS and steps.
- A comment's highlighted range is local-only in collaboration for v1 (same scope every other range-based formatting operation already has — see [Comments](#comments)); a comment thread's `anchorRunIds` is a creation-time hint only, not re-validated after later formatting edits reshape that range.
