import { captureSubtree, remapSubtreeIds } from '../clipboard/serialize.js';
import { insertBlock, updateRun } from '../store/operations.js';

/** Batches ops if the store supports it (a History instance), else applies them one at a time — same idiom as blocks/shared/mergeCommands.js. */
function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Captures one or more sibling blocks (each with its own descendants) as a
 * reusable, storable template — the block-level counterpart to
 * `exportDocumentJSON` for whole documents. Ids are kept as-is (matching the
 * app clipboard's own JSON payload); `insertBlockTemplate` remaps them fresh
 * at insert time, so the same template can be inserted any number of times
 * without ever colliding with existing content.
 */
export function captureBlockTemplate(store, blockIds) {
  return { roots: blockIds.map((id) => captureSubtree(store, id)) };
}

/**
 * Inserts a captured block template as new sibling blocks under `parentId`,
 * starting at `index` — the same "remap ids, then insert" loop
 * useClipboardHandlers.js's onPaste uses for multi-block paste, reused here
 * instead of duplicated as a one-off.
 */
export function insertBlockTemplate(store, template, { parentId, index }) {
  const ops = [];
  let nextIndex = index;
  for (const root of template.roots) {
    const { block, runs, subtreeBlocks } = remapSubtreeIds(root);
    block.parentId = parentId;
    ops.push(insertBlock(block, parentId, nextIndex, { blocks: [block, ...subtreeBlocks], runs }));
    nextIndex += 1;
  }
  applyOps(store, ops);
}

/**
 * Wholesale-replaces an already-mounted editor's content with a document
 * template — the "apply this starter document to a live editor" counterpart
 * to passing `doc` to `useEditor()` at creation time. Same Map-reassignment
 * approach usePersistedDocument.js uses for loading a persisted document
 * (written fresh here rather than shared, to avoid touching that file).
 */
export function applyDocumentTemplate(store, doc) {
  const rawStore = store.store ?? store; // unwrap a History instance to the underlying EditorStore
  rawStore.blocks = new Map((doc.blocks ?? []).map((b) => [b.id, b]));
  rawStore.runs = new Map((doc.runs ?? []).map((r) => [r.id, r]));
  rawStore.rootId = doc.rootId ?? null;
  rawStore.fieldTypes = new Map((doc.fieldTypes ?? []).map((f) => [f.id, f]));
  rawStore._fieldTypesSnapshot = null;
  rawStore._orders = new Map();
  rawStore._notify([...rawStore.blocks.keys(), ...rawStore.runs.keys()]);
}

/**
 * Registers block-level templates as slash commands — discoverable and
 * insertable via "/" alongside every built-in block, with no changes needed
 * to SlashMenu/useSlashMenuTrigger/BlockRegistry, since those already just
 * read whatever `listSlashCommands()` returns. Each template is registered
 * under a synthetic key that's never used as a real block's `type` (no
 * block of that type is ever inserted — only the template's own captured
 * blocks, which already carry their own real types), so `component`/
 * `isLeaf` here are never actually reached.
 */
export function registerBlockTemplates(registry, templates) {
  for (const template of templates) {
    registry.register(`__blockTemplate:${template.id}`, {
      component: () => null,
      isLeaf: true,
      slashCommand: {
        label: template.label,
        icon: template.icon,
        keywords: template.keywords ?? [template.label],
        run(store, { blockId, runId, sliceStart, sliceEnd }) {
          // clear the "/query" text that triggered this, same as every other block's slashCommand
          const run = store.getRun(runId);
          const value = run?.value ?? '';
          store.applyOperation(updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }));

          const current = store.getBlock(blockId);
          const parent = store.getBlock(current.parentId);
          const index = parent.contentIds.indexOf(blockId) + 1;
          insertBlockTemplate(store, template, { parentId: current.parentId, index });
        },
      },
    });
  }
}
