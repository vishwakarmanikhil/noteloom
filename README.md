# noteloom

[![version](https://img.shields.io/npm/v/noteloom.svg?label=version&color=3178c6)](https://www.npmjs.com/package/noteloom)
[![downloads](https://img.shields.io/npm/dm/noteloom.svg?label=downloads&color=44cc11)](https://www.npmjs.com/package/noteloom)
[![license](https://img.shields.io/npm/l/noteloom.svg?label=license&color=44cc11)](https://github.com/vishwakarmanikhil/noteloom/blob/master/LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-333?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/vishwakarmanikhil)

**[Live site & docs →](https://noteloom.qusere.in)** · **[Play with the demo →](https://noteloom.qusere.in/playground/)**

A React-first, block-based rich text editor with **zero runtime dependencies** — the only things it expects from your app are `react` and `react-dom`. Everything else (undo/redo, clipboard, slash commands, tables, inline widgets) is built from scratch on top of a small normalized document store.

## ✨ Highlights

- **12 built-in block types** — paragraph, heading, list (bulleted/numbered/to-do/toggle), table, multi-column layout, divider, callout, blockquote, code, toggle heading, button, embed, and a freehand **canvas** (draw/sketch/shapes/arrows/text — [see below](#drawing--sketching-the-canvas-block)).
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

## Install

```bash
npm install noteloom react react-dom
```

## Quick start

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
        runs: [{ id: 'r1', type: 'text', value: 'Hello — try typing "/" for commands.', marks: {} }],
      }),
    );
    return { store, registry, inlineRegistry };
  }, []);

  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
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

See `examples/basic` for a complete working app (run `npm run dev`).

### Styling — zero setup required

You don't need to import any CSS. The moment `<EditorProvider>` mounts, it injects a single `<style>` tag with a minimal, clean default theme — no `import 'noteloom/style.css'` line, no build-tool CSS configuration, nothing to wire up. It's idempotent (mounting more than one editor on a page only injects it once) and client-only (a no-op under SSR; hydrate as normal and it injects on mount).

**Retheme it** by overriding the CSS custom properties it reads from — defined on `:root` (not scoped to a wrapper element, since portaled pieces like the slash menu and Select's popover aren't DOM descendants of the editor itself):

```css
:root {
  --noteloom-accent: #16a34a;      /* swap the indigo accent for green */
  --noteloom-radius-md: 4px;       /* sharper corners */
  --noteloom-font: 'Inter', sans-serif;
}
```

Dark mode follows `prefers-color-scheme` automatically; to control it explicitly instead (e.g. a manual light/dark toggle), set `data-theme="dark"` or `data-theme="light"` on any ancestor (typically `<html>`) — see the full variable list in `src/style.css`.

**Scope overrides to one editor instance**, or add your own class for full custom CSS, via `<EditorProvider>`'s `className`/`style` props — passing either wraps `children` in one `<div className="be-root ...">`:

```jsx
<EditorProvider store={store} registry={registry} className="my-editor" style={{ '--noteloom-accent': '#16a34a' }}>
  ...
</EditorProvider>
```

No wrapper `<div>` is added unless you pass one of these props, so existing usage is unaffected either way.

**Opt out entirely** with `theme="none"` — nothing gets injected, and you take full responsibility for styling every `.be-*` class yourself (or import `noteloom/style.css` manually if you just want control over *when* it loads, e.g. before your own overrides in a specific `<link>` order):

```jsx
<EditorProvider store={store} registry={registry} theme="none">
```

`examples/basic/src/style.css` shows the extra page-level chrome (fonts, page width, the demo's own toolbar buttons) a host app typically adds around the editor — none of that is part of the default theme itself.

**Customize individual blocks**, not just the root, via `getBlockClassName`:

```jsx
<EditorProvider
  store={store}
  registry={registry}
  getBlockClassName={(block) => (block.type === 'callout' ? 'my-callout' : undefined)}
>
```

Whatever string you return is appended onto that block's own root element's class list (`be-paragraph my-callout`, alongside the fixed base class) — `block` is the real block object (`type`, `id`, `props`), so you can target a type, a specific id, or a prop value (e.g. every red callout) as precisely as you like.

## Exporting the document (JSON / HTML / plain text)

```js
import { exportDocumentJSON, exportDocumentHTML, exportDocumentText } from 'noteloom';

exportDocumentJSON(store); // { rootId, blocks, runs } — feed straight back into `new EditorStore(...)`
exportDocumentHTML(store, registry, inlineRegistry);
exportDocumentText(store, registry, inlineRegistry);
```

Or mount the ready-made button + modal instead of wiring your own UI:

```jsx
import { DocumentExportButton } from 'noteloom';

<DocumentExportButton label="View source" />
```

It opens a modal with JSON/Simple JSON/HTML/Text tabs (reading live from the store every time it opens) and a Copy button — useful for debugging, or as a starting point for a real "export" feature.

## A simpler JSON shape for storage/API/CRUD use

`exportDocumentJSON()` above returns the *internal engine format* — the same normalized, id-referenced graph `EditorStore` operates on (blocks reference other blocks by id; text lives in a separate `runs` collection, not embedded inline). That shape is what makes per-run reactivity, O(1) structural edits, and real nesting (toggle lists, tables, inline atomic chips) work — it's not going to look like a simple flat document, on purpose.

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
const store2 = new EditorStore(doc);
```

Rich text (`data.text`) is an HTML string — the exact same per-run serialization every block type's own clipboard-copy `toHTML` already produces, so marks (bold/italic/underline/strike/code/sub/superscript/color/highlight/link) and atomic inline chips (checkbox/date/select/mention) round-trip through it the same way copy/paste already does. `table` is flattened specially (`data.columns` + `data.rows`, a 2D array) rather than exposing the internal table/row/cell block chain — the single biggest simplification versus the internal shape. Block/run ids are preserved on both export and import (useful for referencing/updating a specific block from an external system).

One existing, by-design limitation carried over from clipboard paste: an atomic inline type's *core* value round-trips (a checkbox's checked state + label, a date's ISO value, a select's chosen value + label) but its full `options` list does not — only the currently-selected option survives, the same as pasting one of these chips into another instance of the editor today.

This is purely an additive, alternate *interchange* format — the internal engine format above is unaffected either way, and this is not a replacement for it.

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

## Printing & PDF

`style.css` includes a built-in `@media print` stylesheet: every piece of editing chrome (the block gutter, all portaled menus, the floating toolbar, resize handles, the mobile action bar, etc.) is hidden automatically, and a block hidden via "Hide in preview" stays hidden in the printout too, regardless of whether the app happens to be toggled into preview mode at the moment you print — printing always behaves like preview mode.

There's no bundled PDF-generation library (that would need a real dependency like jsPDF/pdfmake, conflicting with staying zero-runtime-dependency) — the browser's own print-to-PDF is the intended path:

```js
window.print(); // Ctrl+P / Cmd+P works too — "Save as PDF" in the print dialog is your PDF export
```

This only cleans up the *editor's* own chrome. A host app's own outer UI (nav bar, sidebar, its own toolbar) needs its own `@media print` rules the same way — see `examples/basic/src/style.css` for a worked example, since that chrome lives entirely outside this package.

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

No speech-to-text SDK is bundled (same zero-runtime-dependency reasoning as PDF export above) — this is built entirely on the browser's own `SpeechRecognition`/`webkitSpeechRecognition`, so `isSupported` is `false` wherever that API doesn't exist. A command is only recognized when an entire *finalized* spoken utterance (a natural pause before/after, as reported by the Speech API itself) matches a known phrase exactly — see `src/voice/voiceCommands.js` for the full table — so a command word merely mentioned mid-sentence while dictating prose is never misread as a command.

## Mobile / touch support

Typing "/"/"@" still works on a phone keyboard, but it's not a reliable or discoverable primary path there (autocorrect, awkward key access, nothing to discover it by) — so on a coarse (touch) pointer, mount `MobileActionBar` alongside your other trigger hooks and it takes over as the touch-first equivalent, pinned above the on-screen keyboard:

```jsx
import { MobileActionBar } from 'noteloom';

// next to your other trigger hooks/components, same containerRef:
<MobileActionBar containerRef={containerRef} />
```

It renders nothing on a mouse/trackpad, and nothing until focus is actually inside the editor. Its contents swap based on context:

- **Block options** (shown whenever the caret/selection is inside any block) → Duplicate/Move up/Move down/Hide-Show/Delete, in `MobileBlockOptionsSheet` — the mobile home for the desktop per-block gutter's own grip-handle menu. The gutter itself is hidden entirely on touch input (no hover state exists to reveal it by, and its desktop position sits in a page margin that doesn't exist on a narrow viewport), so both of its actions ("+" and the options menu) live in this bar instead of the gutter on touch.
- **Text selected** → formatting actions (bold/italic/underline/link) — the desktop `FloatingToolbar` bubble also disables itself on touch, so this is the single formatting surface either way (both share the same `useTextFormattingActions` hook, not two copies).
- **Collapsed caret, table cell** → insert row/column.
- **Collapsed caret, code block** → language picker.
- **Collapsed caret, callout** → color picker.
- **Collapsed caret, everywhere else** → "+" (opens `MobileBlockPickerSheet`, a tap-friendly bottom sheet listing every insertable block, same commands "/" already offers), Undo/Redo, dismiss-keyboard.

Trigger-menu and `Select` popovers reposition above the caret instead of below it when there isn't room before the keyboard, via `useVirtualKeyboardInset()` (also exported, in case you're positioning your own UI against the keyboard).

**Touch detection deliberately isn't a static `matchMedia('(pointer: coarse)')` check** (see `useCoarsePointer`, also exported) — a touchscreen laptop reports its trackpad as the "primary" pointer even though the touchscreen sitting right there can be used at any moment, so a pure media-query check would never show touch UI on that class of device. Instead, the media query only supplies the *initial* guess (correct pre-interaction, SSR-safe); every real `pointerdown` afterward overrides it with that event's own `pointerType`, so a 2-in-1 laptop correctly shows desktop UI while the trackpad is in use and mobile UI the instant the screen is tapped, live, no reload needed. The same signal is mirrored onto `<html class="be-touch-input">` so plain CSS (the gutter-hiding rule above) reacts to it too, not just `MobileActionBar` itself.

**Not included**: a touch equivalent for dragging in the block gutter to select a range of blocks — Notion, TipTap, and Editor.js all keep that gesture desktop/mouse-only too.

## Built-in block types

`paragraph`, `heading` (h1–h3), `listItem` (bulleted, numbered, to-do, and toggle — with Notion-style Tab/Shift+Tab nesting and Enter conventions), `table` (with row/column insert/delete), `layout` (multi-column), `divider`, `callout`, `blockquote`, `code`, `toggleHeading`, `button`, `embed` (image/video/audio/file), and `canvas` (see next section).

### Drawing & sketching: the canvas block

A freehand drawing surface, insertable via `/canvas` (or the icon in the slash menu) — pen, eraser, resizable text, and rectangle/ellipse/arrow shapes, each with their own color/fill pickers, all in a fixed-size box you can resize like an embed. Exports to a self-contained inline `<svg>` (see `exportSvg.js`) as part of the document's normal HTML export, so it round-trips through copy/paste and `exportDocumentHTML` without a canvas-to-image conversion step.

```js
import { createBlockRegistry, registerBlocks, canvasBlockType } from 'noteloom';

const registry = createBlockRegistry();
registerBlocks(registry, { canvas: canvasBlockType /* , ...other blocks */ });
```

Strokes/shapes are authored in a fixed 0–1000 normalized coordinate space, independent of the block's own rendered pixel size — resizing the canvas never has to rescale the drawing data itself. There's no OCR/description generation, so a canvas has no plain-text representation (`toPlainText` returns `''`, matching a divider's decorative nature) and, in this first version, pasted/foreign SVG markup doesn't reverse-parse back into editable stroke data — a canvas block can only be created via its own slash command.

## Picking only the blocks you want

`registerBuiltInBlocks`/`registerBuiltInInlineTypes` register everything at
once — the fastest way to a fully-featured editor. If you'd rather ship
only what you actually use (TipTap's `extensions: [...]` idea), every
built-in block/inline type is also exported individually, and
`registerBlocks`/`registerInlineTypes` register just the ones you name:

```js
import {
  createBlockRegistry,
  registerBlocks,
  paragraphBlockType,
  headingBlockType,
  TABLE_BLOCKS, // table needs its row/cell types alongside it — spread the whole group
} from 'noteloom';

const registry = createBlockRegistry();
registerBlocks(registry, {
  paragraph: paragraphBlockType,
  heading: headingBlockType,
  ...TABLE_BLOCKS,
});
// registry now only knows about paragraph/heading/table — nothing else
// (callout, button, embed, ...) shows up in the slash menu or renders at all.
```

`registerBuiltInBlocks(registry)` is itself just `registerBlocks(registry, { paragraph: paragraphBlockType, ... })` with every type included — so mixing "give me everything" and "just these few" across different parts of your app is never an either/or choice. `layout` has the same "needs its own group" shape as `table` — see `LAYOUT_BLOCKS`. `TABLE_SELECT_INLINE_TYPES` (inline side) is only needed if you use a table's "select" column type.

## Built-in inline types

Atomic, non-text content that can be spliced into running text via the slash menu at any cursor position — `select` (with in-editor add/remove-option UI), `date` (native `<input type="date">`).

There's no separate hardcoded `mention` type — an `@name` chip is just an ordinary use of `createSelectFieldType` (see the next section), with `triggers: ['slash', 'at']` so it also shows up under a second, dedicated "@" trigger (`useAtMenuTrigger`), alongside "/". See the example app's "Assignee" field type for a full worked example.

## Custom select field types (static, or dynamic/API-backed)

`createSelectFieldType(config)` builds a full, ready-to-register inline type from a plain config object — this is how you add your own named dropdown ("Assignee", "Status", "Priority", ...) without writing a component:

```js
import { createInlineRegistry, createSelectFieldType } from 'noteloom';

const inlineRegistry = createInlineRegistry();

inlineRegistry.register(
  'status',
  createSelectFieldType({
    type: 'status', // must match the key you register it under
    label: 'Status', // shown in the "/" menu and as the search box's aria-label
    placeholder: 'Set status…',
    variant: 'tag', // 'tag' = Notion-style colored pill; 'default' = plain bordered dropdown
    options: [
      { value: 'todo', label: 'To do', color: { bg: '#e9e9e7', text: '#37352f' } },
      { value: 'doing', label: 'In progress', color: { bg: '#fdecc8', text: '#a06400' } },
      { value: 'done', label: 'Done', color: { bg: '#dbeddb', text: '#2f7a2f' } },
    ],
  }),
);
```

`options` can also be a **function** instead of a plain array — `(query) => Option[] | Promise<Option[]>` — for a real database/API-backed search (React Select's `loadOptions`, essentially):

```js
inlineRegistry.register(
  'assignee',
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
  }),
);
```

A few things worth knowing about the dynamic path:

- Your function is called **fresh on every keystroke**, debounced ~250ms — there's no built-in caching layer, so if you want caching, memoize inside your own function.
- Only the **resolved pick** — `{ value, label }` (plus `color` for the tag variant) — is ever written onto the document. The live options list itself is never persisted, so a chip never embeds a stale snapshot of your database; re-opening it always calls your function again.
- `triggers` (default `['slash']`) decides whether the type shows up under `/`, `@` (via `useAtMenuTrigger`), or both — see the "Assignee" example above. A field that doesn't read naturally after "@" (e.g. "Priority") should usually stay slash-only.

### Letting end users create their own field types, in-editor

The above is for types **you** define in code. If you also want a non-technical end user to be able to create new (always static — there's no way to author a fetch function through a UI) select types from inside the editor itself, mount `FieldTypeEditorModal` once and wire a button to it:

```jsx
import { EditorProvider, FieldTypeEditorModal, useFieldTypeEditor } from 'noteloom';

function NewFieldTypeButton() {
  const { openCreate } = useFieldTypeEditor();
  return <button onClick={openCreate}>+ New field type</button>;
}

// Anywhere under <EditorProvider>:
<NewFieldTypeButton />
<FieldTypeEditorModal />
```

User-created types are persisted in the document's own `fieldTypes` collection (so they survive reload) and are automatically rehydrated back into your inline registry by `FieldTypeEditorModal` itself — you don't need to call anything extra. Each chip's popover also gets a "Manage options…" entry that reopens this same modal, pre-filled, for renaming/editing/deleting the type it belongs to.

## Registering your own block/inline types

```js
registry.register('myBlock', {
  component: MyBlockComponent, // receives only { id }
  isLeaf: true, // true if contentIds holds run ids, false if it holds child block ids
  toHTML(block, ctx) { /* ... */ },
  fromHTML(domNode, ctx) { /* ... or return null if this node isn't yours */ },
  toPlainText(block, ctx) { /* ... */ },
  slashCommand: { label: 'My Block', keywords: ['my'], run(store, ctx) { /* ... */ } },
});
```

## Accessibility

- Every portaled popover that's a genuine standalone action menu (the block gutter's Duplicate/Move/Hide/Delete menu, the block-range action menu, a table column's options menu) is keyboard-operable: opening one moves real focus onto its first item, ArrowUp/ArrowDown move between items (wrapping), Home/End jump to the first/last, and Escape closes it and returns focus to whatever opened it — not just a name-only `role="menu"` that only responds to mouse clicks.
- `Modal` moves focus into the dialog (its first focusable element) on open and restores it to whatever had focus before on close — not a full focus trap (this package stays zero-dependency, and its dialogs are short, single-purpose forms, not deep navigable UI), just "focus doesn't go missing."
- Structural actions that don't otherwise move focus anywhere describable (duplicate/move/hide/delete a block, or a whole selected range) announce what happened via a shared, visually-hidden `aria-live="polite"` region — screen-reader users get "Block deleted"/"3 blocks moved up" instead of silence.
- Embed images have a real, separately-authored `alt` text field (a toolbar button opens a small dialog to set it) — `alt` is never silently filled in from the uploaded file's raw filename or a pasted URL string, since neither is meaningful alt text.
- Table header cells have `scope="col"`, and the column-resize/embed-resize sliders both expose `aria-valuemin/valuemax/valuenow`.

## Live collaboration (experimental)

Real-time multi-peer editing, built as a custom **block-tree CRDT** — not a generic text-CRDT library bolted on — so it stays true to the zero-runtime-dependency design. Peers connect directly over WebRTC; you bring your own signaling (a WebSocket relay, Firebase/Supabase realtime, or anything else that can pass small JSON messages between two peers) to bootstrap the connection.

```js
import { EditorStore, History, CollabSession } from 'noteloom';

const store = new History(new EditorStore(myDoc));

// `signaling` is any object shaped like SignalingChannel (src/sync/signaling.js):
// { localPeerId, send(toPeerId, message), onMessage(cb) }
const session = new CollabSession({ history: store, signaling });

// `initiator: true` on exactly one side of each pair
session.connect(remotePeerId, { initiator: true });
```

From then on, every edit made via `store`/`history` (typing, inserting/moving/deleting blocks, "Turn into" type conversions) is automatically broadcast to connected peers, and incoming changes merge in live. A runnable example, using the browser's native `BroadcastChannel` as a zero-server signaling backend for a same-machine two-tab demo, is in `examples/collab/` — run `npm run dev:collab` and open the URL in two tabs.

**How conflicts resolve:**
- Concurrent inserts (even at the same position) — both survive, converging to the same order on every peer.
- Concurrent delete vs. edit of the same block — the delete wins.
- Concurrent type-conversion of the same block ("Turn into") — one type wins deterministically (the same one, on every peer), not two duplicate blocks.
- Concurrent edits to a run's text — whole-value last-write-wins (the newer edit replaces the older one entirely; character-level interleaving, like Google Docs, is not implemented).

**Known limitations — read before relying on this in production:**
- **Undo is local-only, and can overwrite a peer's edit to the same run.** Your undo/redo never touches a peer's changes directly — but because text merges as *whole-value* LWW (see above), undoing your own past edit to a run replays an old full-string snapshot, which will clobber anything a peer has since typed into that same run. Avoid undoing text you know a peer may have touched; a true fix requires character-level text merging, which is a deliberately larger, not-yet-built change.
- **Deleted content is never garbage-collected.** Tombstones for deleted blocks are kept forever (needed so a late-arriving concurrent operation can still resolve correctly) — long collaborative sessions with heavy insert/delete churn grow unbounded memory over time.
- **A peer joining with their own existing (different) document does not merge with yours.** `CollabSession` only adopts a peer's document wholesale when your own side is still empty — the common "open a shared link and get the document" flow. Reconciling two independently-created, already-diverged documents on first contact is a fundamentally harder problem (no shared id space) and isn't attempted.
- **Reconnecting after a dropped connection re-syncs the full document**, not just what was missed — simple and correct, at the cost of O(document size) traffic per reconnect.
- Only structural block changes and field edits (props, type, run text) are collaboration-aware. A few coarse "resync" operations (`setBlockContentIds`, `replaceRunSpan`, `setBlockRuns` — used for DOM-reconciliation escape hatches like paste-into-contentEditable or IME composition) remain local-only for now.
- Large single messages (e.g. an embedded video/file's `data:` URL, or a full-document `syncResponse` for a big document) are transparently fragmented, flow-controlled against the data channel's own backpressure, and reassembled under the hood — you don't need to do anything for this, but very large embeds mean more individual send calls and somewhat higher latency to fully arrive.

## Development

```bash
npm install
npm run dev     # examples/basic dev server
npm test        # vitest (jsdom + @testing-library/react)
npm run build   # library build (dist/, ESM + CJS)
```

## Known limitations

- No accessibility affordance exists for grouping sibling list items under a shared `role="list"` container (each list item is an independent block, not wrapped in one) — adding `role="listitem"` without that ancestor would be worse than no role at all, so it's deliberately left out pending a bigger structural change.
- The library doesn't render your editor's own root/surface element (that's host-rendered — see `examples/basic/src/App.jsx`'s `EditorSurface`), so it can't add `role="document"`/`aria-label` there itself; the example app demonstrates doing this on your own surface element, which is worth copying into your own app.
- Cross-block mark toggling (bold/italic/underline over a selection spanning multiple blocks) applies as one store operation per block, not a single atomic undo step.
- `select`'s option-adding UI and any `createSelectFieldType`-based type's options (e.g. an "Assignee" @-mention) are meant as a starting point — a real app will want to wire its own people/options source.
- RTL support covers direction resolution (`dir="auto"` + per-block/document override) and the highest-impact visual pieces (list markers, blockquote border, block gutter position) — a full logical-properties rewrite of every hardcoded pixel value in `style.css` is a bigger follow-up, not yet done.
- Voice typing (`useVoiceTyping`) only acts on *finalized* speech results, not interim/in-progress ones, and command detection requires a spoken command to be its own complete utterance — there's no explicit "command mode" trigger (push-to-command, wake phrase) yet, just pause-based auto-detection.
- Automated tests run under jsdom; there is no automated real-browser test suite. If you hit an edge case jsdom can't reproduce (anything involving actual native `contentEditable` browser quirks, or the real Web Speech API), please file an issue with the exact browser/OS and steps.
