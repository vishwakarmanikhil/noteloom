import { stripEmptyRunPlaceholder } from './domRunSync.js';

/**
 * v1 scope: resolves the native selection only when it's a non-collapsed
 * range entirely within one run's single text node — matches the same
 * single-run limitation as toggleMarkOnRunRange and the clipboard range
 * resolution. Returns null for collapsed selections or ranges spanning
 * multiple runs/blocks.
 */
export function resolveRunSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || range.startContainer !== range.endContainer) return null;

  const container = range.startContainer;
  const el = container.nodeType === 1 ? container : container.parentElement;
  const runEl = el?.closest?.('[data-run-id]');
  if (!runEl) return null;
  const blockEl = runEl.closest('[data-block-id]');
  if (!blockEl) return null;

  const rawText = container.textContent ?? '';
  return {
    runId: runEl.getAttribute('data-run-id'),
    blockId: blockEl.getAttribute('data-block-id'),
    startOffset: stripEmptyRunPlaceholder(rawText.slice(0, range.startOffset)).length,
    endOffset: stripEmptyRunPlaceholder(rawText.slice(0, range.endOffset)).length,
  };
}

/**
 * Native selection gestures that don't drill into a specific run's text
 * node — Ctrl+A "select all" within one contentEditable region is the main
 * one — anchor directly on the shared contentEditable container instead,
 * addressing by child-index rather than character offset. Without this,
 * detecting "the whole current block is already selected" (the trigger for
 * promoting a second Ctrl+A to a whole-document selection) silently fails
 * for exactly the selection shape native select-all actually produces.
 */
function resolveContainerLevelSelection(node, offset) {
  if (node?.nodeType !== 1 || node.getAttribute?.('contenteditable') !== 'true') return null;
  const children = node.childNodes;
  if (children.length === 0) return null;

  const atEnd = offset >= children.length;
  const child = children[atEnd ? children.length - 1 : Math.max(0, offset)];
  const runId = child?.nodeType === 1 ? child.dataset?.runId : undefined;
  if (!runId) return null;
  const blockEl = child.closest('[data-block-id]');
  if (!blockEl) return null;

  return {
    runId,
    blockId: blockEl.getAttribute('data-block-id'),
    // Raw DOM length, not the logical (placeholder-stripped) length: a run
    // that started empty and was later typed into keeps a leftover
    // zero-width-space byte in its actual text node forever (see
    // TextRunSpan in EditableBlockContent.jsx — never rewritten, to avoid
    // resetting the caret on every keystroke), even though run.value itself
    // is clean. Using the raw length here would put native select-all's
    // offset one character ahead of run.value.length for exactly those
    // blocks, which is exactly what silently broke "is the whole block
    // selected" detection for any block typed into after being created
    // empty (slash-menu-created blocks, Enter-split blocks, etc.).
    offset: atEnd ? stripEmptyRunPlaceholder(child.textContent ?? '').length : 0,
  };
}

function resolveRunAndOffset(node, offset) {
  const containerLevel = resolveContainerLevelSelection(node, offset);
  if (containerLevel) return containerLevel;

  let el = node?.nodeType === 1 ? node : node?.parentElement;
  const runEl = el?.closest?.('[data-run-id]');
  if (!runEl) return null;
  const blockEl = runEl.closest('[data-block-id]');
  if (!blockEl) return null;

  // `offset` is a raw DOM char index when node is the run's own text node;
  // when the selection anchors on the run element itself (e.g. an empty/
  // atomic island), it's a child-node index instead — convert to a char
  // count. Either way, strip any leftover placeholder byte so the result
  // lines up with run.value.length (see the matching comment in
  // resolveContainerLevelSelection above — same underlying cause).
  let charOffset = stripEmptyRunPlaceholder((node.textContent ?? '').slice(0, offset)).length;
  if (node === runEl) {
    charOffset = 0;
    for (let i = 0; i < offset && i < runEl.childNodes.length; i += 1) {
      charOffset += stripEmptyRunPlaceholder(runEl.childNodes[i].textContent ?? '').length;
    }
  }

  return {
    runId: runEl.getAttribute('data-run-id'),
    blockId: blockEl.getAttribute('data-block-id'),
    offset: charOffset,
  };
}

/**
 * Resolves a *collapsed* caret to the run+char-offset it sits at — used by
 * Enter-to-split so the new block gets exactly the text after the caret,
 * instead of always starting blank. Returns null for a non-collapsed
 * selection or a caret that isn't inside any run at all.
 */
export function resolveCollapsedCaret() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  return resolveRunAndOffset(selection.anchorNode, selection.anchorOffset);
}

/**
 * Resolves a non-collapsed selection that may span *multiple runs within
 * the same block* (e.g. selecting text that crosses a bold boundary) —
 * generalizes resolveRunSelection's single-run limitation. Returns null if
 * the selection spans multiple blocks (use resolveCrossBlockSelection for
 * that) or if either end isn't inside a run at all.
 */
export function resolveMultiRunSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const anchor = resolveRunAndOffset(selection.anchorNode, selection.anchorOffset);
  const focus = resolveRunAndOffset(selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return null;
  if (anchor.blockId !== focus.blockId) return null; // cross-block: use resolveCrossBlockSelection

  return {
    blockId: anchor.blockId,
    startRunId: anchor.runId,
    startOffset: anchor.offset,
    endRunId: focus.runId,
    endOffset: focus.offset,
  };
}

/**
 * Resolves a non-collapsed selection spanning *multiple sibling blocks*
 * under a shared parent (e.g. from the middle of one paragraph through the
 * middle of another a few blocks down) — for toggleMarkOverBlockRange.
 * Needs `store` (unlike the other resolvers here) to walk the parent's
 * contentIds and slice out the sibling range. Returns null when the
 * selection is actually within one block (use resolveMultiRunSelection
 * instead), or when the two blocks aren't siblings under the same parent
 * (nested at different depths — not supported in v1).
 */
export function resolveCrossBlockSelection(store) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const anchor = resolveRunAndOffset(selection.anchorNode, selection.anchorOffset);
  const focus = resolveRunAndOffset(selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return null;
  if (anchor.blockId === focus.blockId) return null; // same block: use resolveMultiRunSelection

  const startBlock = store.getBlock(anchor.blockId);
  const parent = startBlock && store.getBlock(startBlock.parentId);
  if (!parent) return null;

  const ids = parent.contentIds;
  const i1 = ids.indexOf(anchor.blockId);
  const i2 = ids.indexOf(focus.blockId);
  if (i1 === -1 || i2 === -1) return null; // not siblings under the same parent

  const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];

  return {
    blockIds: ids.slice(from, to + 1),
    startBlockId: anchor.blockId,
    startRunId: anchor.runId,
    startOffset: anchor.offset,
    endBlockId: focus.blockId,
    endRunId: focus.runId,
    endOffset: focus.offset,
  };
}
