# Examples

Runnable demo apps, not part of the published npm package (see `noteloom`'s own `CONTRIBUTING.md`). Each has its own `npm run dev:*` script from the repo root.

## The learning ladder

Each of these adds exactly **one** new thing over the previous one — read them in order:

| #   | Folder                                          | Run                             | What it adds                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`01-quickstart/`](01-quickstart)               | `npm run dev:quickstart`        | The whole Quick Start: `useEditor()` + `<NoteloomEditor>`, nothing else.                                                                                                                                                                      |
| 2   | [`02-custom-block/`](02-custom-block)           | `npm run dev:custom-block`      | A brand-new block type (`rating`, a 5-star widget with no text content) registered alongside the built-ins.                                                                                                                                   |
| 3   | [`03-custom-field-type/`](03-custom-field-type) | `npm run dev:custom-field-type` | A brand-new inline field type (`status`, a colored-pill dropdown) via `createSelectFieldType` — no component to write.                                                                                                                        |
| 4   | [`04-styling/`](04-styling)                     | `npm run dev:styling`           | Retheming: CSS custom property overrides, `className`, and `getBlockClassName`.                                                                                                                                                               |
| 5   | [`05-templates/`](05-templates)                 | `npm run dev:templates`         | Document + block templates: developer-defined block snippets insertable via "/", saving the current document as a reusable template, and a `TemplatePicker` gallery for starting a new document from one (or importing one from a JSON file). |
| 6   | [`06-comments/`](06-comments)                   | `npm run dev:comments`          | Comments: the fully built-in experience (`commentAuthorId` + `showCommentsPanel`) — a floating-toolbar composer, click/hover-to-view popovers on highlighted text, and a right-side thread panel, with zero comment-UI code of your own.      |
| 7   | [`07-version-history/`](07-version-history)     | `npm run dev:version-history`   | Version history, Google Docs-style: automatic snapshots (no "name it and save" step) attributed to whoever made them, browsed/restored via the built-in `<VersionHistory>` button + drawer.                                                   |

## Feature deep-dives

Not steps in the ladder above — each is a complete app focused on one specific capability:

| Folder                                | Run                           | Focus                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`basic/`](basic)                     | `npm run dev`                 | Everything at once, built from the granular API (not `useEditor()`) — the reference for "how do I build this myself instead of using the simplified path."                                                                                            |
| [`collab/`](collab)                   | `npm run dev:collab`          | Real-time collaboration over `BroadcastChannel` (same-browser, zero server — open two tabs).                                                                                                                                                          |
| [`lan-collab/`](lan-collab)           | `npm run dev:lan-collab`      | Real-time collaboration over a WebSocket relay (`tools/lan-relay-server/`) — real multi-device/LAN sync, plus live peer cursors and an auto-reconnect watchdog that actually catches up on what it missed (see the README's "Reconnecting reliably"). |
| [`offline-persist/`](offline-persist) | `npm run dev:offline-persist` | IndexedDB document persistence + a PWA app shell (works with no network at all).                                                                                                                                                                      |

See the main [README](../README.md) for the full guide these examples accompany.
