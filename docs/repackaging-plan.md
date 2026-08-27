# Repackaging plan — making noteloom easy to install, extend, and contribute to

Status: **draft / proposal** · Owner: @vishwakarmanikhil · Target: `noteloom` 0.4 → 1.0

---

## 1. Why re-plan

noteloom grew feature-first. The engine is good, but the _package_ was never
designed as a product other people build on. Concretely, today:

| Symptom                                       | Evidence                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One giant flat API                            | `src/index.js` has **112 `export` lines / ~150 named exports**; the README is **923 lines** and splits itself into "Basic guide" vs "Advanced: the granular API".                                                                             |
| Everything ships in one bundle                | Single `noteloom` entry, **~564 KB ESM** + **81 KB CSS**. Voice, canvas (2 500-line component), WebRTC/CRDT, comments, versions, PWA are all in the same package graph.                                                                       |
| Half-built features are in the public surface | CRDT primitives are exported with the doc comment _"Phase A: pure, in-memory CRDT core — not yet wired into EditorStore/History or any transport."_                                                                                           |
| The extension contract is informal            | A block type is a bare object (`{ component, isLeaf, defaultProps, toHTML, fromHTML, toPlainText, toMarkdown, slashCommand }`) documented **only** in a JSDoc comment on `BlockRegistry`. No factory, no types, no validation, no versioning. |
| Two document formats                          | `exportDocumentJSON` (internal normalized graph) **and** `exportDocumentSimpleJSON` (flat). New users have to understand both to pick one.                                                                                                    |
| Types are a manual tax                        | `src/index.d.ts` is **955 hand-written lines** that CONTRIBUTING says must be kept in sync by hand ("it's hand-written, not generated, so nothing enforces this").                                                                            |
| React-only                                    | The store core is framework-agnostic in principle, but every documented path goes through `useEditor()` / `<NoteloomEditor>`. No non-React story.                                                                                             |
| No contributor guardrails                     | "There's no linter configured yet"; sync work "only caught by opening two real browser tabs".                                                                                                                                                 |

None of this is a rewrite. The engine, the block set, the normalized store, the
per-run reactivity, and the `examples/` learning ladder are keepers. What needs
design is the **boundary** between the engine and the people using it.

### 1.1 Non-negotiable constraints

Everything below is designed around three hard rules:

1. **Nothing that works today may break** before a deliberate major version.
   Every phase before 1.0 is _additive_ — new entry points and new APIs land
   next to the old ones, which keep working with a deprecation warning at most.
   The `examples/` apps must run untouched after every phase.
2. **The basic editor stays a one-line import.** Like Tiptap's `StarterKit`, the
   default `import { useEditor, NoteloomEditor } from 'noteloom'` must still give
   a fully working editor (all common blocks, formatting, slash menu, undo/redo,
   clipboard, default theme) with **no extra imports**. Consumers should not have
   to hand-list built-in blocks to get a normal editor.
3. **Heavy/optional features are opt-in, per document, via their own import** —
   `import { CollabSession } from 'noteloom/collab'`, etc. — never in the default
   bundle, never required for the basic case.

noteloom already uses only **named exports** (no default export); that stays.
The goal is _fewer import lines for the common case_, not more.

---

## 2. R&D — how Tiptap and Editor.js are packaged

### 2.1 Tiptap

- **Headless core, framework on top.** `@tiptap/core` knows nothing about React.
  `@tiptap/react`, `@tiptap/vue-3`, `@tiptap/svelte` are thin adapters.
  `@tiptap/pm` re-exports the ProseMirror bits so consumers never install them
  directly.
- **Every feature is its own package.** `@tiptap/extension-bold`,
  `@tiptap/extension-table`, … dozens of them. `@tiptap/starter-kit` is a
  convenience meta-package that bundles the common set. You install only what you
  use; the rest never enters your graph.
- **One extension shape for everything.** `Extension.create({…})`,
  `Node.create({…})`, `Mark.create({…})` — a declarative config object with a
  fixed, documented, _typed_ set of hooks: `name`, `addOptions`,
  `addAttributes`, `parseHTML`, `renderHTML`, `addCommands`,
  `addKeyboardShortcuts`, `addNodeView`, `addInputRules`, `addProseMirrorPlugins`.
  `.configure(options)` is the single knob.
- **No default CSS.** Styling is the app's job; they ship optional CSS / a
  Tailwind typography preset separately.
- **Tooling:** monorepo, TypeScript throughout (types are generated, never
  hand-written), a `@tiptap/cli` that scaffolds a new extension, per-doc pages on
  tiptap.dev with a "create your own extension" tutorial, semantic-release +
  changelog per package.

### 2.2 Editor.js

- **Core ships almost nothing** — just the block-management engine. Every content
  type (`@editorjs/header`, `@editorjs/list`, `@editorjs/image`, …) is a separate
  npm package you pass into `tools: {}` at construction time.
- **A Block Tool is a class with a tiny contract:** `constructor({ data, config,
api, readOnly })`, `render() → HTMLElement`, `save(el) → data`, and optional
  `validate()`, `renderSettings()`, `static get toolbox()`, `static get
pasteConfig`, `static get sanitize`. That's the whole surface, and it's
  exhaustively documented ("Creating a Block Tool" is a multi-part guide).
- **One clean output format:** `{ time, blocks: [{ type, data }], version }`.
  There is no "internal vs simple" — the saved JSON _is_ the format.
- **Framework-agnostic** (vanilla DOM). React/Vue wrappers exist as community
  packages around the same core.
- **`api` object** is how a tool talks back to the editor (`api.blocks`,
  `api.selection`, `api.toolbar`, …) — a deliberately small, stable facade
  instead of reaching into internals.

### 2.3 What to borrow

| Borrow                                                               | From               | Applied to noteloom                                                                         |
| -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Headless framework-free core + thin React adapter                    | Tiptap             | `noteloom` (core) has no `react` import; `noteloom/react` is the adapter.                   |
| Optional features are opt-in entry points, not in the default bundle | Both               | `noteloom/collab`, `/persistence`, `/comments`, `/versions`, `/voice`, `/canvas`.           |
| A single, typed, documented factory for extensions                   | Tiptap             | `defineBlock()` / `defineInline()` replacing the bare object.                               |
| Small stable `api`/`ctx` facade passed to extensions                 | Editor.js          | Formalize the `ctx` already passed to `toHTML`/`run`.                                       |
| One canonical document format                                        | Editor.js          | Promote the "simple" JSON to _the_ format; internal graph becomes an implementation detail. |
| Generated types, lint, scaffolding CLI, per-topic docs               | Tiptap             | See §6–7.                                                                                   |
| A convenience "everything" meta-import                               | Tiptap starter-kit | `noteloom/starter-kit` = today's `useEditor()` defaults.                                    |

**Where noteloom should _not_ follow them:** a full multi-package monorepo with
12 independently-versioned packages is right for a funded team, not a
single-maintainer project. Get the same isolation with **subpath exports from one
package** first (§3), and only split into real packages when there's a second
regular maintainer or an external plugin ecosystem to serve.

---

## 3. Target architecture

### 3.1 Layers

```
┌─────────────────────────────────────────────────────────────┐
│ noteloom/starter-kit   "give me a working editor in 3 lines" │
├─────────────────────────────────────────────────────────────┤
│ noteloom/react         hooks + <Editor> + built-in chrome    │
│ noteloom/blocks/*      one entry per block family            │
│ noteloom/collab  /persistence  /comments  /versions  /voice  │
│ noteloom/theme         the default CSS (explicit import)     │
├─────────────────────────────────────────────────────────────┤
│ noteloom               FRAMEWORK-FREE CORE                    │
│                        store · operations · history ·        │
│                        registries · document model ·         │
│                        defineBlock / defineInline · export   │
└─────────────────────────────────────────────────────────────┘
```

Rules:

1. **`noteloom` (core) must not import `react`/`react-dom`.** Enforce with an
   import-boundary lint rule. This is the single most important structural change
   — it makes "is this engine logic or view logic?" an unambiguous question and
   unlocks a future Vue/Svelte/vanilla adapter for free.
2. **Optional features are separate entry points** with their own `peerDependencies`
   if needed, their own CSS, and their own docs page. Nothing in the default
   `noteloom/react` bundle should pull in WebRTC, `SpeechRecognition`, IndexedDB,
   or the canvas component.
3. **The default theme is an explicit import** (`import 'noteloom/theme'`), not
   auto-injected. Auto-injection is magic that fights SSR, CSP, and load order;
   keep it available as `injectTheme()` for the quickstart path but stop doing it
   implicitly. `starter-kit` can re-export a component that calls it so the
   "zero-setup" story survives for people who want it.

### 3.2 Package-layout decision

**Phase 1 (0.4): one package, many entry points.** Reorganize `src/` to mirror
the layers and declare subpath `exports` in `package.json`:

```jsonc
"exports": {
  ".":            { "types": "./dist/core/index.d.ts",   "import": "./dist/core/index.js" },
  "./react":      { "types": "./dist/react/index.d.ts",  "import": "./dist/react/index.js" },
  "./starter-kit":{ "types": "./dist/starter-kit/index.d.ts", "import": "./dist/starter-kit/index.js" },
  "./blocks/*":   { "types": "./dist/blocks/*/index.d.ts", "import": "./dist/blocks/*/index.js" },
  "./collab":     "…", "./persistence": "…", "./comments": "…",
  "./versions":   "…", "./voice": "…", "./canvas": "…",
  "./theme":      "./dist/theme.css",
  "./package.json": "./package.json"
}
```

Each entry point gets its own Vite lib build target so bundlers can drop unused
entries entirely (not just tree-shake within one big module).

**Phase 2 (post-1.0, only if warranted):** promote entry points to real
`@noteloom/*` packages in a workspace, with `noteloom` kept as a meta-package
re-exporting them for back-compat. Trigger: a second maintainer, or third-party
plugins that need to depend on `@noteloom/core` without the React adapter.

### 3.3 What moves where

| Today (`src/…`)                                                                                                                                               | New home                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `store/`, `registry/`, `inline/`, `clipboard/serialize·deserialize·exportDocument`, `search/findInDocument`, `templates/blockTemplates` (capture/insert core) | `noteloom` core                                                                                                                      |
| `react/` hooks & components, `commands/` trigger hooks, `blocks/*/**.jsx` view layer                                                                          | `noteloom/react`                                                                                                                     |
| `blocks/*` (type entries)                                                                                                                                     | `noteloom/blocks/<family>` — `text` (paragraph/heading/list/quote/callout/code/divider/toggle), `table`, `layout`, `embed`, `button` |
| `crdt/`, `sync/`                                                                                                                                              | `noteloom/collab` — and **mark it `experimental` in one place**, stop exporting "not yet wired" primitives from core                 |
| `persistence/`, `react/usePersistedDocument`, `react/useServiceWorkerUpdate`                                                                                  | `noteloom/persistence`                                                                                                               |
| `comments/`, comment components/hooks                                                                                                                         | `noteloom/comments`                                                                                                                  |
| `versions/`, version components/hooks                                                                                                                         | `noteloom/versions`                                                                                                                  |
| `voice/`, `react/useVoiceTyping`, voice components                                                                                                            | `noteloom/voice`                                                                                                                     |
| `blocks/canvas/`                                                                                                                                              | `noteloom/canvas` (heaviest single component in the repo)                                                                            |
| `style.css`                                                                                                                                                   | `noteloom/theme` + per-feature CSS co-located with its entry                                                                         |

---

## 4. The extension API

Replace the bare registry object with **factories that own the contract**. This
is the change that makes "customize / integrate / contribute" tractable.

### 4.1 `defineBlock`

```ts
import { defineBlock } from 'noteloom';

export const callout = defineBlock({
  name: 'callout',                 // required, unique
  contentModel: 'blocks',          // 'blocks' | 'runs' | 'void'  (replaces isLeaf boolean)
  defaultProps: { icon: '💡' },
  schemaVersion: 1,                 // NEW: lets a block migrate its own props over time

  // view — the ONLY framework-specific piece; lives in / is re-exported by the
  // react adapter, so a block package is `index.js` (contract) + `view.jsx`
  view: CalloutView,

  // serialization: all optional, all pure (block, ctx) => …
  toHTML, fromHTML, toPlainText, toMarkdown,

  // commands contributed to the slash menu / command palette
  commands: [
    { id: 'callout', label: 'Callout', keywords: ['aside', 'note'], icon: CalloutIcon,
      run: (ctx) => ctx.insertAfterCurrent(createCallout()) },
  ],

  keymap: { 'Mod-Shift-c': (ctx) => … },   // NEW: declared, not buried in a keyboard hook
});
```

- **`ctx` is a documented, stable facade** (`ctx.store`, `ctx.registry`,
  `ctx.insertAfterCurrent`, `ctx.selection`, `ctx.replaceRange`, …) — the
  Editor.js `api` idea. Extensions never reach into `EditorStore` internals;
  everything they're allowed to do is on `ctx`, and `ctx` is what we promise not
  to break.
- **`defineBlock` validates** at registration: name collision, missing required
  fields, `contentModel` vs presence of `toHTML` children handling, dev-only
  warnings for a missing `fromHTML` on a pasteable type.
- **`schemaVersion` + optional `migrate(props, from)`** so a third-party block can
  evolve its stored shape without the core document format bumping.

### 4.2 `defineInline`

Same shape for inline widgets. `createSelectFieldType` stays as a
higher-level helper built _on_ `defineInline` (it already is, effectively).

### 4.3 `defineExtension` (behavior, no content)

For cross-cutting behavior that isn't a block or inline type (smart quotes,
auto-pair brackets, markdown shortcuts, a custom paste transform). Today these
are ad-hoc hooks (`useSmartQuotes`, `useAutoPairBrackets`, …). A
`defineExtension({ name, keymap, inputRules, onPaste, plugins })` unifies them and
lets them be passed in the same `extensions: []` array as blocks — one
registration list instead of "register blocks here, wire hooks there".

### 4.4 One registration surface

```jsx
const editor = useEditor({
  extensions: [
    ...starterKit(), // or hand-pick:
    text.paragraph,
    text.heading,
    table,
    embed,
    callout, // your custom block
    smartQuotes(), // a behavior extension
  ],
  doc,
});
```

This replaces the current `registerBlocks` / `registerInlineTypes` /
`registerBuiltInBlocks` / `registerBuiltInInlineTypes` /
`registerBlockTemplates` / `TABLE_BLOCKS` / `LAYOUT_BLOCKS` /
`TABLE_SELECT_INLINE_TYPES` / separate keyboard-shortcut hooks — **9+ concepts
collapse into one `extensions` array**, the Tiptap model. The granular functions
can remain as the implementation underneath for one release, then be dropped.

---

## 5. Document model — pick one format

- **Promote `exportDocumentSimpleJSON`'s shape to _the_ public format**
  (`{ version, blocks: [{ id, type, data, children? }] }`). It's already
  documented as the storage/API/CRUD shape; make it the default of
  `editor.toJSON()` / `useEditor({ doc })`.
- **The normalized graph becomes internal.** Still there, still what powers
  per-run reactivity, but not something a consumer is asked to think about.
  `editor.toJSON({ format: 'internal' })` stays for the collab/debug cases.
- **Publish a JSON Schema** for the public format and version it explicitly.
  Round-trip tests (`fromJSON(toJSON(doc)) deepEquals doc`) become a CI gate.
- Document the one known lossy edge (atomic inline `options` list not surviving)
  in the schema doc, not scattered across the README.

---

## 6. Developer experience

| Area             | Now                                                       | Change                                                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Types**        | 955-line hand-written `index.d.ts`, kept in sync manually | Adopt **JSDoc + `tsc --emitDeclarationOnly`** (keeps "no build to run tests") _or_ migrate `src` to TS. Either way types are **generated**; delete the hand-written file. `api-extractor` to produce one rolled-up `.d.ts` per entry + a public-API report that fails CI on unintended surface changes. |
| **Lint**         | none                                                      | ESLint + Prettier. Two rules that matter most: `import/no-restricted-paths` (core ↛ react, feature ↛ feature) and `no-restricted-imports` for `react` inside core.                                                                                                                                      |
| **Versioning**   | manual `version` bump                                     | **Changesets.** Every PR that changes public behavior adds a changeset; release notes + `CHANGELOG.md` generated.                                                                                                                                                                                       |
| **Bundle watch** | none                                                      | `size-limit` per entry point in CI, with a budget (e.g. core ≤ 40 KB gz, react adapter ≤ 60 KB). Regressions fail the check.                                                                                                                                                                            |
| **Scaffolding**  | copy an existing `blocks/*` folder                        | `npm create noteloom-block` (or `npx noteloom new block <name>`) that emits `index.js` + `view.jsx` + `<name>.test.js` from a template. Mirrors `@tiptap/cli`.                                                                                                                                          |
| **Sync testing** | "open two real tabs"                                      | Keep that, but add a Playwright multi-context spec (`test-e2e/`) that drives two editor instances through one relay so the regressions listed in CONTRIBUTING are guarded automatically.                                                                                                                |

---

## 7. Docs & contribution

- **Split the 923-line README** into a docs site (`docs/` → the existing
  noteloom.qusere.in): Quickstart · Configuration · Styling · one page per
  optional feature · **"Build a custom block"** tutorial · **"Build a behavior
  extension"** · API reference (generated) · Migration guide · Architecture
  (this doc's §3, for contributors).
- README shrinks to: what it is, the 3-line quickstart, the feature matrix with
  links, contributing pointer.
- **`CONTRIBUTING.md` per concern**: core, react, a feature package, a block. Each
  says where the sibling tests live and what "done" means.
- **Plugin template repo** (`noteloom-block-starter`) — a standalone repo a
  contributor can fork to publish their own block to npm without touching the
  monorepo. This is what turns "contribute" from "open a PR against core" into
  "publish your own package", the thing that actually grows an ecosystem.
- **`examples/` ladder is already good** — keep it, re-point imports at the new
  entry points, add one example: "a block published as its own package, consumed
  here".

---

## 8. Phased rollout

Sequenced so that **every phase through 1.0 is additive** (see §1.1). After each
one, `import { useEditor, NoteloomEditor } from 'noteloom'` and all `examples/*`
work exactly as before. The old API is only _removed_ at 2.0, long after the new
one is proven.

### The verification problem

Re-running a full manual regression pass after every phase is the real cost of
this work. The answer is a **one-time automated gate** that makes each phase a
"push PR → wait for CI → 5-minute smoke" step instead:

| Gate                                                                                                                                                                                                       | Catches                                                 | Build cost     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------- |
| **Export-surface snapshot** — a test that imports `noteloom` + every subpath and asserts the exported-name set matches a committed snapshot                                                                | any accidental removal/rename while moving files around | ~2h once       |
| **Golden-document e2e** — one Playwright script drives `examples/basic`: type text, slash-insert every block type, format, undo/redo, table row/col ops, then export JSON; the exported doc is snapshotted | any behavioral regression in the editor                 | ~1d once       |
| **Multi-context collab spec** — two editor instances through one relay, scripted                                                                                                                           | the "open two browser tabs" checks from CONTRIBUTING    | ~0.5d once     |
| existing 131 vitest files, `tsc`, `size-limit`                                                                                                                                                             | engine logic, types, bundle size                        | already exists |

Capture the golden snapshots from **current `master`** — that is the
known-good baseline every later phase is diffed against.

**Phases 0–2 change no runtime behavior** (files move, entry points are added,
nothing is removed), so they can ship as **one `0.4.0` release with a single
verification pass** — the export snapshot + golden-doc spec fully cover them.
Reserve real testing effort for Phase 3+.

For Phase 3, run the **existing test suite against both code paths**
(`registerBuiltInBlocks` vs `extensions: [...]`) by parameterizing the test
setup — this proves equivalence with almost no new tests written.

### Phase &minus;1 — build the gate (do this first)

- **[done]** `test/publicApi.test.js` — imports the `noteloom` main entry, asserts
  the sorted export-name set (217 names) and the `operations` namespace match a
  frozen list. Any add/drop/rename fails the test and shows up as a diff to
  consciously accept. Extend it to cover each new subpath entry as Phase 1 adds
  them, and to snapshot the generated `.d.ts` rollup once Phase 0 lands.
- **[done]** `test-e2e/fixtures/golden/` + `test-e2e/golden-document.spec.js` — a
  deterministic document (fixed ids, every built-in block + atomic inline type)
  rendered through `useEditor` + `<NoteloomEditor>`, with committed snapshots of
  `exportDocumentJSON` / `SimpleJSON` / `HTML` / `Markdown` / `Text` and the
  normalized editor DOM, plus a type-then-undo round-trip. Snapshots are
  OS-agnostic (`test-e2e/__snapshots__/`, no platform suffix) so CI (Linux) and
  local dev share one set.
- **[done]** e2e wired into CI as a dedicated `e2e` job in `.github/workflows/ci.yml`
  (`npx playwright install --with-deps chromium` + `npm run test:e2e`).
- **[todo]** `test-e2e/collab.spec.js`: two editor instances through one relay —
  the "open two browser tabs" checks from CONTRIBUTING, automated.
- **Exit:** all green on `master` with zero source changes; snapshots committed. ✔ for the first three items.

> **Phases 0–2 ship together as `0.4.0`** behind one verification pass (see
> above). They are listed separately only because they are independent units of
> work, not because each needs its own release or its own regression cycle.

### Phase 0 — groundwork · part of `0.4.0` (no API change at all)

Pure repo hygiene, invisible to consumers.

- **[done]** ESLint 9 flat config (`eslint.config.js`) — real-bug rules as
  errors, everything stylistic/aspirational as `warn` (0 errors / ~108 warnings
  today), plus `npm run lint`/`lint:fix`. Import-boundary rules deferred to
  Phase 1/2 when the layers exist.
- **[done]** Prettier config (`.prettierrc.json` / `.prettierignore`) +
  `format` / `format:check` scripts. **Pending decision:** the one-time
  `prettier --write` touches ~284 files — do it as its own isolated commit,
  then add `format:check` to CI. Not gated in CI until that lands.
- **[done]** Changesets (`.changeset/`, `npm run changeset`), default CLI
  changelog, `baseBranch: master`.
- **[done]** `size-limit` (`.size-limit.json`, `npm run size`, new `lint` CI
  job) — budgets: ESM ≤ 140 kB gz (now 133.6), theme CSS ≤ 18 kB gz (now 15.7).
- **[revised]** `src/index.d.ts` stays **hand-written** — generating it from the
  untyped `.js` source would replace real signatures with `any`, a downgrade
  (full TS migration is post-1.0, see §9). Instead a new check in
  `test/publicApi.test.js` asserts every runtime export has a declaration in the
  `.d.ts`; it immediately caught 6 pre-existing gaps (`addPerson`,
  `updatePerson`, `removePerson`, `usePeople`, `useSmartQuotes`,
  `useAutoPairBrackets`), now fixed. `api-extractor` can be added later for a
  richer report.
- **[todo]** multi-context Playwright sync spec (also listed under Phase −1).
- **Exit:** CI green, zero runtime/behavior/API change. ✔ except the Prettier
  reformat + `format:check` CI gate, which await the decision above.

### Phase 1 — add optional-feature entry points · part of `0.4.0` (additive only)

This is the phase that answers "basic import, extras per document". **No files
that affect the public API move; nothing is removed.**

- Add subpath `exports` that **re-export existing modules**:
  `noteloom/collab`, `noteloom/persistence`, `noteloom/comments`,
  `noteloom/versions`, `noteloom/voice`, `noteloom/canvas`, `noteloom/theme`.
- Split the Vite build into one target per entry so a consumer importing only
  `noteloom` + `noteloom/react` no longer pulls WebRTC / SpeechRecognition /
  IndexedDB / the canvas component into their bundle.
- The main `noteloom` entry **still re-exports every one of those symbols too**,
  now with a one-time `console.warn` in dev pointing at the new path. Both work.
- Document the new imports; update `examples/*` to use them (proof they're
  real) — but the old imports in anyone else's code keep working.
- **Exit:** `examples/*` run with only mechanical import edits; default-path
  bundle (`noteloom` + `noteloom/react`, no extras) is measurably smaller than
  0.3.x; every 0.3.x import still resolves.

### Phase 2 — framework-free core boundary · part of `0.4.0` (internal only)

- Move engine files so core code never imports `react`/`react-dom`; add the
  lint rule at error level. Export surface of `noteloom` is unchanged — it still
  re-exports the React pieces for back-compat; internally they now live behind
  `noteloom/react`.
- **Exit:** `import/no-restricted-imports` passes; no export added or removed.

### Phase 3 — the `defineBlock` extension API · `0.5.0` (additive only)

- Ship `defineBlock` / `defineInline` / `defineExtension` + the stable `ctx`
  facade, and a `useEditor({ extensions: [...] })` option **next to** the
  existing `registerBlocks` / `registerBuiltInBlocks` / `registerInlineTypes` /
  `registerBlockTemplates` options.
- Reimplement the built-ins on top of `defineBlock` internally (proves the
  contract) — output and behavior identical.
- `noteloom/starter-kit` entry = today's `useEditor()` defaults as one value.
- Scaffolding CLI + `noteloom-block-starter` template repo.
- `register*` functions still work, now documented as "legacy — prefer
  `extensions`".
- **Exit:** one built-in block _and_ one `examples/` custom block authored only
  through public `defineBlock` + `ctx`, no internal imports; every old
  registration path still passes its tests.

### Phase 4 — document format · `0.6.0` (opt-in default, escape hatch kept)

- `editor.toJSON()` / `useEditor({ doc })` accept **both** shapes (detected by
  `version` / structure). New docs default to the simple schema'd format;
  `{ format: 'internal' }` still produces the normalized graph.
- Publish + version the JSON Schema; add a `fromJSON(toJSON(x)) ≡ x` CI gate.
- **Exit:** existing stored documents in either shape load unchanged.

### Phase 5 — `1.0.0` (still no removals)

- Promote the new APIs to "recommended", freeze them under semver: the `ctx`
  facade, the `define*` field sets, the document schema, and the list of subpath
  entry points.
- Auto-theme-injection becomes opt-in _by default_ only here, with `injectTheme()`
  and a starter-kit component covering the old behavior; the deprecation warning
  has been visible since 0.4.
- `collab` labelled `experimental` and versioned separately if not yet solid.
- Write the migration guide + a codemod for the mechanical import moves.

### Phase 6 — `2.0.0` (the only breaking release)

- Remove the deprecated main-entry re-exports of moved features and the legacy
  `register*` functions. By now the replacements have shipped for several minor
  versions and the codemod exists.

---

## 9. Risks & open questions

- **TS migration vs JSDoc.** Full TS is the better end state but a large diff and
  a change to the "no build to test" property. Recommendation: JSDoc+emit now,
  revisit full TS after 1.0. **Decision needed.**
- **Auto-injected theme removal** is the most user-visible break. The `warn +
shim` path covers it, but confirm we're willing to make people add one import.
- **`collab`/`crdt`** — is it a supported feature or a lab? The plan assumes
  "experimental, isolated, separately gated". If it's meant to be a headline
  feature, it needs its own hardening track that's out of scope here.
- **Single vs multi-package** — plan commits to single-package/subpath-exports
  through 1.0. If an external plugin ecosystem shows up sooner, Phase 2 promotes
  to `@noteloom/*` earlier.
- **Effort.** Phases 0–2 are the bulk (~weeks of focused work for one person).
  Phases 0 and 1 deliver value on their own if the rest slips.

---

## 10. TL;DR of the decisions being proposed

1. **Framework-free core**, `noteloom/react` as a thin adapter. Core never imports React.
2. **Subpath entry points** for every optional feature (`/collab`, `/persistence`,
   `/comments`, `/versions`, `/voice`, `/canvas`, `/theme`) — not a monorepo yet.
3. **`defineBlock` / `defineInline` / `defineExtension` + a stable `ctx` facade**
   replace the informal registry object and 9+ registration concepts with one
   `extensions: []` array.
4. **One document format** (today's "simple" JSON), schema'd and versioned;
   normalized graph goes internal.
5. **Explicit `import 'noteloom/theme'`** instead of auto-injection.
6. **Generated types, ESLint, Changesets, size-limit, a scaffolding CLI, a plugin
   template repo**, and a docs site that isn't one 923-line file.
7. **Phased 0.4 → 1.0**, every phase shippable, compat shim until 1.0.
