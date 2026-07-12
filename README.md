# noteloom

[![version](https://img.shields.io/npm/v/noteloom.svg?label=version&color=3178c6)](https://www.npmjs.com/package/noteloom)
[![downloads](https://img.shields.io/npm/dm/noteloom.svg?label=downloads&color=44cc11)](https://www.npmjs.com/package/noteloom)
[![license](https://img.shields.io/npm/l/noteloom.svg?label=license&color=44cc11)](https://github.com/vishwakarmanikhil/noteloom/blob/master/LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-333?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/vishwakarmanikhil)

**[Live site & docs →](https://noteloom.qusere.in)** · **[Play with the demo →](https://noteloom.qusere.in/playground/)**

A React-first, block-based rich text editor with **zero runtime dependencies** — the only things it expects from your app are `react` and `react-dom`. Everything else (undo/redo, clipboard, slash commands, tables, inline widgets) is built from scratch on top of a small normalized document store.

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

It opens a modal with JSON/HTML/Text tabs (reading live from the store every time it opens) and a Copy button — useful for debugging, or as a starting point for a real "export" feature.

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

`paragraph`, `heading` (h1–h3), `listItem` (bulleted, numbered, and to-do — with Notion-style Tab/Shift+Tab nesting and Enter conventions), `table` (with row/column insert/delete), `layout` (multi-column), `divider`.

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

## Development

```bash
npm install
npm run dev     # examples/basic dev server
npm test        # vitest (jsdom + @testing-library/react)
npm run build   # library build (dist/, ESM + CJS)
```

## Known limitations

- No accessibility affordance exists for grouping sibling list items under a shared `role="list"` container (each list item is an independent block, not wrapped in one) — adding `role="listitem"` without that ancestor would be worse than no role at all, so it's deliberately left out pending a bigger structural change.
- Cross-block mark toggling (bold/italic/underline over a selection spanning multiple blocks) applies as one store operation per block, not a single atomic undo step.
- `select`'s option-adding UI and any `createSelectFieldType`-based type's options (e.g. an "Assignee" @-mention) are meant as a starting point — a real app will want to wire its own people/options source.
- Automated tests run under jsdom; there is no automated real-browser test suite. If you hit an edge case jsdom can't reproduce (anything involving actual native `contentEditable` browser quirks), please file an issue with the exact browser/OS and steps.
