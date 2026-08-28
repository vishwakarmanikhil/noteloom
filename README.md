# noteloom

[![version](https://img.shields.io/npm/v/noteloom.svg?label=version&color=3178c6)](https://www.npmjs.com/package/noteloom)
[![downloads](https://img.shields.io/npm/dm/noteloom.svg?label=downloads&color=44cc11)](https://www.npmjs.com/package/noteloom)
[![license](https://img.shields.io/npm/l/noteloom.svg?label=license&color=44cc11)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-333?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/vishwakarmanikhil)

**A React block editor with zero runtime dependencies.** Nestable blocks, inline
widgets mid-sentence, slash commands, tables, undo/redo, clipboard — all built on
a small normalized store. The only things it needs from your app are `react` and
`react-dom`.

**[Docs & demo →](https://noteloom.qusere.in)** · **[Playground →](https://noteloom.qusere.in/playground/)** · **[Full guide](docs/guide.md)**

```bash
npm install noteloom react react-dom
```

```jsx
import { useEditor, NoteloomEditor } from 'noteloom';

function Editor() {
  const editor = useEditor();
  return <NoteloomEditor editor={editor} />;
}
```

That's the whole thing — a working editor with every built-in block/inline type,
slash + `@` + emoji menus, the formatting toolbar, keyboard shortcuts, clipboard,
find & replace, and the default theme, all wired up. No CSS import needed.

Pass a starting document (`useEditor({ doc })` — the [simple JSON format](#document-format)
or the internal shape, auto-detected), or `history: false` to drop undo/redo.

## Highlights

- **Inline widgets are first-class** — a `select` dropdown, date picker, or
  `@mention` chip sits _in the middle of a sentence_, not on its own line.
- **Fine-grained rendering** — every block subscribes only to its own data;
  editing one paragraph in a 500-block doc repaints just that block.
- **13 built-in block types** — paragraph, heading, list (bulleted/numbered/to-do/toggle),
  table, multi-column layout, divider, callout, blockquote, code, toggle heading,
  button, embed, canvas — plus atomic inline types (`select`, `date`, `checkbox`, …).
- **Typed extension API** — `defineBlock` / `defineInline` / `defineExtension`
  with a stable `ctx` facade; `npx noteloom new block <name>` to scaffold one.
- **One canonical document format** — self-contained JSON with a published
  [schema](docs/document.schema.json); `editor.toJSON()`.
- **Opt-in heavy features** — collaboration, persistence, comments, version
  history, voice typing each have their own import so they leave your bundle if
  unused.
- **Retheme-able**, RTL-aware, keyboard-operable, mobile/touch-first.

## Add a custom block

```jsx
import { useEditor, NoteloomEditor, defineBlock, starterKit } from 'noteloom';

const rating = defineBlock({
  name: 'rating',
  component: RatingBlock, // your React component, gets { id }
  contentModel: 'void', // 'blocks' | 'runs' | 'void'
  defaultProps: { stars: 0 },
  toHTML: (block) => `<div data-stars="${block.props.stars}"></div>`,
  slashCommand: { label: 'Rating', keywords: ['stars'], run: /* … */ },
});

const editor = useEditor({ extensions: [...starterKit(), rating] });
```

`defineExtension` also carries **behavior** — `keymap`, `onBeforeInput`,
`onPaste`, `setup(ctx)` — for typing rules, shortcuts, and side effects.
`smartQuotes()` / `autoPairBrackets()` are ready-made ones. Full walkthrough:
[guide → extension API](docs/guide.md#defineblock--extensions--the-newer-way).

## Import map

The basic editor is one import. Heavy optional features have their own entry so
a bundle that doesn't use them drops the code:

| Import                 | What's in it                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `noteloom`             | the editor, every built-in type, menus, clipboard, export, templates, find & replace |
| `noteloom/theme`       | the default stylesheet (also `noteloom/style.css`)                                   |
| `noteloom/starter-kit` | `starterKit()`, `defineBlock`, `defineInline`, `registerExtensions`                  |
| `noteloom/collab`      | real-time collaboration (a custom CRDT over WebRTC)                                  |
| `noteloom/persistence` | IndexedDB auto-save + PWA service-worker hook                                        |
| `noteloom/comments`    | comment threads + the built-in comment UI                                            |
| `noteloom/versions`    | automatic version history + `<VersionHistory>`                                       |
| `noteloom/voice`       | voice typing                                                                         |
| `noteloom/canvas`      | the freehand-drawing block                                                           |

Every name in a feature entry is still exported from `noteloom` too (deprecated;
see [`docs/migration.md`](docs/migration.md)).

## Styling

No CSS import needed — the default theme injects on mount. Retheme via CSS
custom properties on `:root`:

```css
:root {
  --noteloom-accent: #16a34a;
  --noteloom-radius-md: 4px;
  --noteloom-font: 'Inter', sans-serif;
}
```

Or `theme="none"` to style every `.be-*` class yourself. Dark mode follows
`prefers-color-scheme` (or `data-theme="dark"`). Details: [guide → styling](docs/guide.md#styling--zero-setup-required).

> A future major will stop auto-injecting the theme — add `import 'noteloom/theme'`
> now to keep it, or `theme="none"` if you already style the editor.

## Document format

```jsx
const doc = editor.toJSON(); // { version: 1, blocks: [{ id, type, data, children? }] }
const restored = useEditor({ doc }); // loads it back — internal shape works too
```

Schema: [`docs/document.schema.json`](docs/document.schema.json). The normalized
engine graph is available via `editor.toJSON({ format: 'internal' })` when you
need it. HTML / Markdown / Word / plain-text export and a drop-in `View source`
button: [guide → exporting](docs/guide.md#exporting-the-document-json--html--markdown--word--pdf--plain-text).

## Features (all in the [full guide](docs/guide.md))

| Feature                                                                                                                 |                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Custom dropdown / mention field types](docs/guide.md#custom-dropdown--mention-field-types-static-or-dynamicapi-backed) | static or API-backed, no component to write                       |
| [Templates](docs/guide.md#templates)                                                                                    | reusable documents + insertable block snippets                    |
| [Comments](docs/guide.md#comments)                                                                                      | thread on a range; built-in UI or bring your own                  |
| [Version history](docs/guide.md#version-history)                                                                        | Google Docs-style automatic snapshots + diff                      |
| [Offline persistence + PWA](docs/guide.md#offline-persistence)                                                          | IndexedDB auto-save, offline app shell                            |
| [Live collaboration](docs/guide.md#live-collaboration-experimental)                                                     | multi-peer over WebRTC, bring-your-own signaling _(experimental)_ |
| [Voice typing](docs/guide.md#voice-typing)                                                                              | dictation + spoken commands via the browser's Speech API          |
| [Mobile / touch](docs/guide.md#mobile--touch-support)                                                                   | bottom action bar, tap-friendly sheets                            |
| [Find & replace](docs/guide.md#find--replace)                                                                           | `Ctrl/Cmd+F`, match case / whole word                             |
| [File & image uploads](docs/guide.md#file--image-uploads)                                                               | `data:` URL by default, or wire `uploadFile` to S3/etc.           |
| [RTL / multi-language](docs/guide.md#right-to-left--multi-language-text)                                                | automatic per-block direction                                     |
| [Accessibility](docs/guide.md#accessibility)                                                                            | keyboard-operable menus, live-region announcements                |
| [The granular API](docs/guide.md#advanced-the-granular-api)                                                             | build the editor surface by hand                                  |

## Development

```bash
npm install
npm run dev:quickstart   # examples/01-quickstart
npm test                 # vitest
npm run test:e2e         # Playwright
npm run build            # dist/ (ESM + CJS + .d.ts + CSS)
```

See [`examples/`](examples/README.md) for the learning ladder, [`CONTRIBUTING.md`](CONTRIBUTING.md)
for the contributor guide, and [`docs/stability.md`](docs/stability.md) for what
semver covers.

## License

MIT
