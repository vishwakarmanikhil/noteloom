import { genId } from '../utils/idGen.js';
import { runsToHTML } from '../inline/marks.js';
import { domInlineToRuns } from '../inline/runOps.js';
import { resolveColumns } from '../blocks/table/tableColumns.js';

/**
 * A second, optional, additive document format — self-contained blocks in
 * an array (`children` for nesting instead of id-references, `data`
 * holding each block's own fields) instead of the internal engine's
 * normalized `{ blocks, runs }` graph (id-referenced blocks + a separate
 * runs collection, which is what `exportDocumentJSON`/`EditorStore` use).
 * The internal shape is what it is for real reasons (per-run reactivity,
 * O(1) structural edits, real nesting) — this format exists purely to give
 * a simpler shape for storage/API/CRUD use, converting to/from the
 * internal shape at the boundary; it never changes how the editor itself
 * works.
 *
 * Rich text (`data.text`) is an HTML string produced by `runsToHTML` (the
 * same per-run serialization every block type's own `toHTML` already
 * uses) — carries marks (bold/italic/.../link) and atomic inline chips
 * (checkbox/date/select/...) inline, via the same `data-inline-type="..."`
 * convention those types already use for clipboard copy/paste. Import
 * reverses this with `domInlineToRuns`, the same function clipboard paste
 * already relies on to reconstruct marks and atomic runs from HTML — nothing
 * new is invented here, both directions reuse existing, already-tested
 * machinery.
 *
 * Known, by-design limitation (same as clipboard paste today): an atomic
 * inline type's core value round-trips (checkbox's checked+label, date's
 * ISO date, select's selected value+label) but not its full `options`
 * list — that's inherent to `fromHTML`'s existing behavior, not something
 * unique to this format.
 */

// Which of a block's own `props` fields are meaningful to a host reading
// this format — everything else in `props` is either absent for these
// types or an internal bookkeeping field (e.g. `titleRunIds`) already
// represented some other way here (`data.text`/`children`).
const PROPS_ALLOWLIST = {
  heading: ['level'],
  listItem: ['ordered', 'checked', 'collapsed'],
  toggleHeading: ['level', 'collapsed'],
  code: ['language'],
  button: ['href', 'color', 'customAttrs'],
  embed: ['kind', 'src', 'name', 'alt', 'mimeType', 'align', 'width'],
  callout: ['icon'],
};

// listItem/toggleHeading: own text lives in props.titleRunIds, contentIds
// points at nested child *blocks* (both a "data.text" and "children" type).
const TITLE_RUN_TYPES = new Set(['listItem', 'toggleHeading']);
// Leaf types with no meaningful text content at all (contentIds is always empty).
const NO_TEXT_LEAF_TYPES = new Set(['divider', 'embed']);

function exportBlock(store, registry, block, ctx) {
  const type = block.type;
  const data = {};
  for (const key of PROPS_ALLOWLIST[type] ?? []) {
    if (block.props?.[key] !== undefined) data[key] = block.props[key];
  }

  if (type === 'table') {
    const firstRow = block.contentIds[0] && store.getBlock(block.contentIds[0]);
    data.columns = resolveColumns(block, firstRow?.contentIds?.length ?? 0);
    data.rows = block.contentIds.map((rowId) => {
      const row = store.getBlock(rowId);
      return row.contentIds.map((cellId) => {
        const cell = store.getBlock(cellId);
        return runsToHTML(cell.contentIds.map((runId) => store.getRun(runId)), ctx);
      });
    });
    return { id: block.id, type, data };
  }

  if (TITLE_RUN_TYPES.has(type)) {
    const runIds = block.props?.titleRunIds ?? [];
    data.text = runsToHTML(runIds.map((id) => store.getRun(id)), ctx);
  } else if (registry.isLeaf(type) && !NO_TEXT_LEAF_TYPES.has(type)) {
    data.text = runsToHTML(block.contentIds.map((id) => store.getRun(id)), ctx);
  }

  const result = { id: block.id, type, data };
  if (!registry.isLeaf(type)) {
    result.children = block.contentIds.map((childId) => exportBlock(store, registry, store.getBlock(childId), ctx));
  }
  return result;
}

/**
 * Exports the whole document as the simple format described above.
 * Returns a JSON string (matching `exportDocumentJSON`'s own `{ pretty }`
 * convention) — pass `{ pretty: false }` for a compact single-line string.
 */
export function exportDocumentSimpleJSON(store, registry, inlineRegistry, { pretty = true } = {}) {
  const ctx = { store, registry, inlineRegistry };
  const root = store.getBlock(store.getRootId());
  const blocks = root.contentIds.map((id) => exportBlock(store, registry, store.getBlock(id), ctx));
  return JSON.stringify({ version: 1, blocks }, null, pretty ? 2 : 0);
}

function textToRuns(html, ctx) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html');
  return domInlineToRuns(doc.body.firstChild, ctx);
}

function importTable(simpleBlock, parentId, blocksOut, runsOut, ctx) {
  const { id = genId(), data = {} } = simpleBlock;
  const rowIds = (data.rows ?? []).map((rowCells) => {
    const rowId = genId();
    const cellIds = rowCells.map((cellHTML) => {
      const cellId = genId();
      const runs = textToRuns(cellHTML, ctx);
      runsOut.push(...runs);
      blocksOut.push({ id: cellId, type: 'tableCell', parentId: rowId, contentIds: runs.map((r) => r.id), props: {} });
      return cellId;
    });
    blocksOut.push({ id: rowId, type: 'tableRow', parentId, contentIds: cellIds, props: {} });
    return rowId;
  });
  const block = { id, type: 'table', parentId, contentIds: rowIds, props: { columns: data.columns ?? [] } };
  blocksOut.push(block);
  return block;
}

function importBlock(simpleBlock, parentId, registry, ctx, blocksOut, runsOut) {
  const { id = genId(), type, data = {}, children = [] } = simpleBlock;

  if (type === 'table') return importTable(simpleBlock, parentId, blocksOut, runsOut, ctx);

  const props = {};
  for (const key of PROPS_ALLOWLIST[type] ?? []) {
    if (data[key] !== undefined) props[key] = data[key];
  }

  const block = { id, type, parentId, contentIds: [], props };
  blocksOut.push(block);

  if (TITLE_RUN_TYPES.has(type)) {
    const runs = textToRuns(data.text, ctx);
    runsOut.push(...runs);
    block.props.titleRunIds = runs.map((r) => r.id);
    block.contentIds = children.map((child) => importBlock(child, id, registry, ctx, blocksOut, runsOut).id);
  } else if (registry.isLeaf(type)) {
    if (!NO_TEXT_LEAF_TYPES.has(type)) {
      const runs = textToRuns(data.text, ctx);
      runsOut.push(...runs);
      block.contentIds = runs.map((r) => r.id);
    }
  } else {
    block.contentIds = children.map((child) => importBlock(child, id, registry, ctx, blocksOut, runsOut).id);
  }

  return block;
}

/**
 * Reverses `exportDocumentSimpleJSON` — returns a plain `{ rootId, blocks,
 * runs }` object, the same shape `new EditorStore(doc)` already accepts
 * (this function deliberately doesn't construct a store itself, matching
 * how the rest of this library hands back plain data rather than
 * pre-wrapping it). `json` may be a JSON string or an already-parsed object.
 */
export function importDocumentSimpleJSON(json, registry, inlineRegistry) {
  const doc = typeof json === 'string' ? JSON.parse(json) : json;
  const ctx = { registry, inlineRegistry };
  const rootId = genId();
  const blocksOut = [];
  const runsOut = [];
  const topIds = (doc.blocks ?? []).map((b) => importBlock(b, rootId, registry, ctx, blocksOut, runsOut).id);
  blocksOut.push({ id: rootId, type: 'page', parentId: null, contentIds: topIds, props: {} });
  return { rootId, blocks: blocksOut, runs: runsOut };
}
