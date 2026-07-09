/**
 * Serializes an ordered list of top-level (sibling) block ids into the three
 * clipboard payloads. All per-type formatting is delegated to the registry
 * (toHTML/toPlainText) — this module only owns cross-block concerns: joining
 * blocks together and grouping consecutive `listItem` blocks into one
 * wrapping <ul>/<ol> (a single list item's toHTML only knows about itself,
 * not its siblings).
 */
import { genId } from '../utils/idGen.js';

export function serializeBlockRange(store, registry, blockIds, inlineRegistry) {
  const ctx = { store, registry, inlineRegistry };
  return {
    html: serializeHTML(store, registry, blockIds, ctx),
    text: blockIds
      .map((id) => {
        const block = store.getBlock(id);
        return registry.get(block.type).toPlainText(block, ctx);
      })
      .join('\n'),
    json: JSON.stringify({ version: 1, blocks: blockIds.map((id) => captureSubtree(store, id)) }),
  };
}

function serializeHTML(store, registry, blockIds, ctx) {
  let html = '';
  let i = 0;
  while (i < blockIds.length) {
    const block = store.getBlock(blockIds[i]);
    if (block.type === 'listItem') {
      const ordered = Boolean(block.props.ordered);
      let itemsHTML = '';
      let j = i;
      while (j < blockIds.length) {
        const candidate = store.getBlock(blockIds[j]);
        if (candidate.type !== 'listItem' || Boolean(candidate.props.ordered) !== ordered) break;
        itemsHTML += registry.get('listItem').toHTML(candidate, ctx);
        j += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html += `<${tag}>${itemsHTML}</${tag}>`;
      i = j;
    } else if (block.type === 'blockquote') {
      // Same grouping idea as listItem above: each blockquote block's own
      // toHTML only emits its own line (a <p>), since the model keeps
      // multi-line quotes as separate sibling blocks rather than one
      // container — consecutive quote siblings share one wrapping
      // <blockquote> on the way out, matching how they'd come back in via
      // domWalk's consumeBlockquote.
      let linesHTML = '';
      let j = i;
      while (j < blockIds.length) {
        const candidate = store.getBlock(blockIds[j]);
        if (candidate.type !== 'blockquote') break;
        linesHTML += registry.get('blockquote').toHTML(candidate, ctx);
        j += 1;
      }
      html += `<blockquote>${linesHTML}</blockquote>`;
      i = j;
    } else {
      html += registry.get(block.type).toHTML(block, ctx);
      i += 1;
    }
  }
  return html;
}

/**
 * Read-only capture of a block subtree (block + descendants + their runs)
 * — used for the app-specific clipboard JSON, and reused as-is by
 * `duplicateBlock` (see blocks/shared/blockActions.js) since "clone this
 * subtree with fresh ids" is exactly the same operation either way.
 */
export function captureSubtree(store, rootId) {
  const blocks = [];
  const runs = [];
  const walk = (id) => {
    const run = store.getRun(id);
    if (run) {
      runs.push(run);
      return;
    }
    const block = store.getBlock(id);
    if (!block) return;
    blocks.push(block);
    for (const childId of block.contentIds) walk(childId);
    for (const runId of block.props?.titleRunIds ?? []) walk(runId);
  };
  walk(rootId);
  return { rootId, blocks, runs };
}

/**
 * Regenerates ids for a captured subtree so pasting the same clipboard
 * contents twice never collides with ids already in the document (or with
 * the ids still referenced by the copy source, if it's the same doc).
 */
export function remapSubtreeIds({ rootId, blocks, runs }) {
  const idMap = new Map();
  for (const b of blocks) idMap.set(b.id, genId());
  for (const r of runs) idMap.set(r.id, genId());
  const remap = (id) => idMap.get(id) ?? id;

  const newBlocks = blocks.map((b) => ({
    ...b,
    id: remap(b.id),
    parentId: b.parentId ? remap(b.parentId) : b.parentId,
    contentIds: b.contentIds.map(remap),
    props: {
      ...b.props,
      ...(b.props?.titleRunIds ? { titleRunIds: b.props.titleRunIds.map(remap) } : {}),
    },
  }));
  const newRuns = runs.map((r) => ({ ...r, id: remap(r.id) }));
  const newRootId = remap(rootId);

  return {
    block: newBlocks.find((b) => b.id === newRootId),
    runs: newRuns,
    subtreeBlocks: newBlocks.filter((b) => b.id !== newRootId),
  };
}
