import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, useInlineRegistry, useSelectedBlock } from './EditorProvider.jsx';
import { useRun } from './useBlock.js';
import { updateRun, setBlockRuns, removeBlock } from '../store/operations.js';
import { reconcileDomToRuns, EMPTY_RUN_PLACEHOLDER, stripEmptyRunPlaceholder } from './domRunSync.js';
import { isRunBlank, isRunsEmpty } from '../blocks/shared/blockEmpty.js';
import { isContentlessBlock } from '../blocks/shared/contentless.js';
import { genId } from '../utils/idGen.js';
import { focusRunEnd, focusRunStart } from './focusRun.js';
import { LinkHoverCard } from './LinkHoverCard.jsx';

/**
 * Keeps the block wrapper's data-empty attribute (see the be-*[data-empty]
 * placeholder CSS) in sync on every keystroke — not just on structural
 * changes. Ordinary typing goes through the "onlyValueChanges" fast path in
 * handleInput below, which applies a plain updateRun op that only notifies
 * that *run's* own subscribers (see EditorStore's UPDATE_RUN case) — the
 * block itself never re-renders, by design, so it can't recompute this
 * itself from a React render the way its *initial* data-empty value is set.
 * Written directly onto containerRef.current.parentElement — always the block's
 * own wrapper element (the div/h-tag every ParagraphBlock/HeadingBlock/
 * ListItemBlock renders EditableBlockContent directly inside of) — gated on
 * data-placeholder so this is a no-op for block types (table cells) that
 * don't opt into the placeholder hint at all.
 */
function syncEmptyAttr(container, runs) {
  const wrapper = container?.parentElement;
  if (!wrapper || !wrapper.hasAttribute('data-placeholder')) return;
  const isEmpty = runs.length === 0 || runs.every(isRunBlank);
  if (isEmpty) wrapper.setAttribute('data-empty', '');
  else wrapper.removeAttribute('data-empty');
}

function marksToStyle(marks = {}) {
  return {
    fontWeight: marks.bold ? 'bold' : undefined,
    fontStyle: marks.italic ? 'italic' : undefined,
    textDecoration:
      [(marks.underline || marks.link) && 'underline', marks.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    verticalAlign: marks.subscript ? 'sub' : marks.superscript ? 'super' : undefined,
    fontSize: marks.subscript || marks.superscript ? 'smaller' : undefined,
    color: marks.color || (marks.link ? 'var(--noteloom-accent)' : undefined),
    backgroundColor: marks.highlight || undefined,
    cursor: marks.link ? 'pointer' : undefined,
  };
}

/**
 * Syncs one text run's value/marks onto a `host` DOM element that
 * `EditableBlockContent` created and owns imperatively (see hostsRef/
 * getOrCreateHost below) — this component renders no DOM of its own
 * (`return null`); it only ever writes into `host` via a layout effect,
 * the same "only touch the DOM if it actually differs" discipline the old
 * EditableRun used.
 *
 * Subscribes to its own run via useRun (not a prop pre-resolved by the
 * parent) so an *external* value change — undo/redo, a future
 * collaborator's edit — still triggers a re-render and gets synced to the
 * DOM. Local typing bypasses this entirely: the browser mutates the text
 * node directly, `EditableBlockContent`'s input handler writes the same
 * value back into the store, and this sync then sees the DOM (once the
 * placeholder is stripped) already matches and does nothing.
 *
 * Critical: the comparison below is against the *stripped* DOM text, not
 * the raw text. `host.textContent = ...` always destroys and recreates the
 * underlying Text node, which resets/collapses the browser's active
 * Selection — comparing raw text (including the placeholder) meant every
 * empty-to-non-empty transition triggered a "cleanup" write that looked
 * harmless but silently reset the caret to the start of the run right
 * after the very first keystroke. Comparing stripped text means ordinary
 * typing — where the DOM already holds the right characters plus a leftover
 * placeholder byte — is a true no-op, so the caret is never touched.
 *
 * The rewrite itself (`setHostText` below) still has to happen on the
 * *opposite* transition — real content backspaced down to nothing — since a
 * host with zero children isn't a valid caret anchor either. But that write
 * mutates the existing Text node's own `.nodeValue` in place instead of
 * going through `host.textContent = ...` whenever a reusable node is
 * already there: a Range/Selection stays anchored to a Text node across a
 * `.nodeValue` change (same node, new data), but `textContent =` always
 * discards the old node and creates a new one, silently collapsing any
 * Selection that pointed into it. Continuously holding Backspace across a
 * whole run hits exactly this transition once, right as the run empties
 * out — on desktop a collapsed Selection is barely noticeable, but a mobile
 * on-screen keyboard treats the same momentary loss as "the field lost
 * focus" and dismisses itself, which is what this specifically fixes.
 */
function setHostText(host, displayValue) {
  const onlyChild = host.childNodes.length === 1 ? host.firstChild : null;
  if (onlyChild && onlyChild.nodeType === 3) {
    if (onlyChild.nodeValue !== displayValue) onlyChild.nodeValue = displayValue;
  } else {
    host.textContent = displayValue;
  }
}

function TextRunSpan({ id, host, onValueSynced }) {
  const run = useRun(id);

  useLayoutEffect(() => {
    if (!host || !run) return;
    const value = run.value ?? '';
    const currentLogicalText = stripEmptyRunPlaceholder(host.textContent);
    const needsRewrite = currentLogicalText !== value || (value === '' && host.textContent === '');
    if (needsRewrite) {
      setHostText(host, value === '' ? EMPTY_RUN_PLACEHOLDER : value);
    }

    const style = marksToStyle(run.marks);
    host.style.fontWeight = style.fontWeight ?? '';
    host.style.fontStyle = style.fontStyle ?? '';
    host.style.textDecoration = style.textDecoration ?? '';
    host.style.verticalAlign = style.verticalAlign ?? '';
    host.style.fontSize = style.fontSize ?? '';
    host.style.color = style.color ?? '';
    host.style.backgroundColor = style.backgroundColor ?? '';
    host.style.cursor = style.cursor ?? '';

    // A link mark is a *style*, not a real <a> — the host is always a plain
    // <span> (created once, before any run's marks are known; see
    // getOrCreateHost), so navigation is opt-in via Ctrl/Cmd+click rather
    // than a native anchor, matching most rich text editors: a plain click
    // still just places the caret for editing.
    const link = run.marks?.link;
    host.title = link?.href ? `${link.href} — Ctrl+Click to open` : '';
    host.onclick = link?.href
      ? (event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          window.open(link.href, link.target === '_blank' ? '_blank' : '_self', 'noopener,noreferrer');
        }
      : null;

    // Covers value changes this component didn't cause itself — undo/redo,
    // a future collaborator's edit — which only notify this *run's* own
    // subscribers (see EditorStore's UPDATE_RUN case), never the block's.
    // Ordinary typing is already covered by handleInput's own call to
    // syncEmptyAttr; this makes every other path to a run's value changing
    // keep the placeholder hint in sync too.
    onValueSynced?.();
  }, [host, run, onValueSynced]);

  return null;
}

/**
 * When the collapsed caret sits right at the boundary between a text run
 * and an atomic (contentEditable={false}) inline chip, native Backspace/
 * Delete would have the *browser* rip that chip's DOM node out on its own —
 * before React ever finds out. React's fiber tree still expects that node
 * to be there, so the next commit's `removeChild` throws
 * ("NotFoundError: ... not a child of this node"). The fix is to never let
 * the browser touch an atomic node's DOM directly: detect the adjacency
 * here, `preventDefault`, and delete the run purely through the store so
 * React's own reconciliation is the only thing that ever removes that DOM
 * node.
 *
 * Deliberately does NOT use `previousElementSibling`/`nextElementSibling` to
 * decide whether the neighbor is atomic — holding Backspace/Delete down
 * fires keydowns faster than React necessarily commits the previous
 * removal's DOM update, so a chip that's already gone from the *logical*
 * run list can still be physically sitting in the DOM for one more event.
 * Trusting that lingering DOM node re-triggered a second delete of an
 * already-deleted run and reproduced the same crash intermittently. `runIds`
 * (the block's current prop, always in sync with the store) and `getRun`
 * are the source of truth for "what's adjacent and is it atomic"; the DOM
 * is only used to find which run the caret currently sits in.
 */
function findAdjacentAtomicRunId(containerEl, runIds, getRun, backward) {
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || !containerEl.contains(anchorNode)) return null;

  const neighborAtomicId = (caretRunId) => {
    const idx = runIds.indexOf(caretRunId);
    if (idx === -1) return null; // caret's run already isn't in the current logical model
    const neighborId = backward ? runIds[idx - 1] : runIds[idx + 1];
    if (!neighborId) return null;
    const neighborRun = getRun(neighborId);
    return neighborRun && neighborRun.type !== 'text' ? neighborId : null;
  };

  // Some browsers select an atomic island as a whole unit, anchoring the
  // caret on the container itself with a child-index offset rather than
  // inside an adjacent text node.
  if (anchorNode === containerEl) {
    const idx = backward ? anchorOffset - 1 : anchorOffset;
    const child = containerEl.childNodes[idx];
    const runId = child?.nodeType === 1 ? child.dataset?.runId : undefined;
    if (!runId || runIds.indexOf(runId) === -1) return null;
    const run = getRun(runId);
    return run && run.type !== 'text' ? runId : null;
  }

  const el = anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement;
  const runEl = el?.closest?.('[data-run-id]');
  if (!runEl || !containerEl.contains(runEl)) return null;

  const atBoundary = backward ? anchorOffset === 0 : anchorOffset === (anchorNode.textContent ?? '').length;
  if (!atBoundary) return null;

  return neighborAtomicId(runEl.getAttribute('data-run-id'));
}

/**
 * Real browsers frequently turn arrow-key navigation past an atomic
 * `contentEditable={false}` island into a *non-collapsed* "select this one
 * node as a unit" selection (the same way an `<img>` gets selected as a
 * whole), rather than leaving a collapsed caret beside it — this is common
 * on ArrowLeft/ArrowRight approach and on click. `findAdjacentAtomicRunId`
 * only handles the collapsed-caret case; without this check, Backspace/
 * Delete on a whole-node selection falls through to native deletion and
 * reproduces the exact same removeChild crash it was meant to prevent.
 *
 * Same rapid-repeat-keydown caution as findAdjacentAtomicRunId: confirm the
 * selected node's run id is still in `runIds` before trusting it.
 */
function findWhollySelectedAtomicRunId(containerEl, runIds, getRun) {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.startContainer !== range.endContainer) return null;
  if (!containerEl.contains(range.startContainer)) return null;
  if (range.endOffset !== range.startOffset + 1) return null;

  const child = range.startContainer.childNodes[range.startOffset];
  const runId = child?.nodeType === 1 ? child.dataset?.runId : undefined;
  if (!runId || runIds.indexOf(runId) === -1) return null;
  const run = getRun(runId);
  return run && run.type !== 'text' ? runId : null;
}

/**
 * Resolves a Range/StaticRange boundary point to "which child of
 * containerEl does it fall in, and at what character offset" — the common
 * currency computeRunsAfterRangeDeletion needs for both boundaries,
 * regardless of whether the point addresses a run's text node directly or
 * the container itself (the same child-index addressing style seen in
 * findAdjacentAtomicRunId/findWhollySelectedAtomicRunId for whole-node
 * selections). Returns null if the point isn't inside any known run.
 */
function resolveRangeBoundary(containerEl, node, offset) {
  if (node === containerEl) return { childIndex: offset, charOffset: null };
  const el = node.nodeType === 1 ? node : node.parentElement;
  const runEl = el?.closest?.('[data-run-id]');
  if (!runEl || !containerEl.contains(runEl)) return null;
  const childIndex = Array.prototype.indexOf.call(containerEl.childNodes, runEl);
  const charOffset = node === runEl ? (offset === 0 ? 0 : (runEl.textContent ?? '').length) : offset;
  return { childIndex, charOffset };
}

/**
 * Typing a replacement character (or composing, or a word/line/cut
 * deletion) over a selection that spans or fully covers an atomic chip
 * goes through `beforeinput`, not a Backspace/Delete keydown — so it's a
 * completely different native-DOM-mutation path than the one
 * findAdjacentAtomicRunId/findWhollySelectedAtomicRunId guard, and hits the
 * exact same removeChild crash if left to native handling. This computes
 * the resulting run list ourselves for any range that touches at least one
 * atomic run, so the caller can preventDefault and apply it through the
 * store instead. Returns null when the range doesn't touch any atomic run
 * at all, so ordinary text edits are completely unaffected — no change in
 * behavior, no new failure mode, for the common case.
 */
function computeRunsAfterRangeDeletion(containerEl, runIds, getRun, range) {
  const start = resolveRangeBoundary(containerEl, range.startContainer, range.startOffset);
  const end = resolveRangeBoundary(containerEl, range.endContainer, range.endOffset);
  if (!start || !end) return null;

  const children = Array.from(containerEl.childNodes).filter(
    (n) => n.nodeType === 1 && n.dataset?.runId && runIds.indexOf(n.dataset.runId) !== -1,
  );

  let touchesAtomic = false;
  const nextRuns = [];
  let insertionIndex = null;

  children.forEach((child, i) => {
    const runId = child.dataset.runId;
    const run = getRun(runId);
    if (!run) return;

    const beforeStart = i < start.childIndex;
    const afterEnd = end.charOffset === null ? i >= end.childIndex : i > end.childIndex;

    if (beforeStart || afterEnd) {
      nextRuns.push(run);
      return;
    }

    const isStartChild = start.charOffset !== null && i === start.childIndex;
    const isEndChild = end.charOffset !== null && i === end.childIndex;

    if (run.type !== 'text') {
      touchesAtomic = true;
      if (insertionIndex === null) insertionIndex = nextRuns.length;
      return; // atomic run fully consumed by the range: dropped
    }

    const value = run.value ?? '';
    if (isStartChild && isEndChild) {
      const survivor = value.slice(0, start.charOffset) + value.slice(end.charOffset);
      if (survivor) nextRuns.push({ ...run, value: survivor });
      insertionIndex = nextRuns.length;
    } else if (isStartChild) {
      const prefix = value.slice(0, start.charOffset);
      if (prefix) nextRuns.push({ ...run, value: prefix });
      if (insertionIndex === null) insertionIndex = nextRuns.length;
    } else if (isEndChild) {
      const suffix = value.slice(end.charOffset);
      if (suffix) nextRuns.push({ id: genId(), type: 'text', value: suffix, marks: run.marks });
    }
    // else: fully inside the range, dropped entirely
  });

  if (!touchesAtomic) return null;
  return { nextRuns, insertionIndex: insertionIndex ?? nextRuns.length };
}

/** Caret is collapsed and sits at the very first text position of the container's first child. */
function isCaretAtContainerStart(containerEl) {
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed) return false;
  const firstChild = containerEl.firstChild;
  if (!firstChild) return true;

  if (selection.anchorNode === containerEl) return selection.anchorOffset === 0;

  let probe = firstChild;
  while (probe && probe.firstChild) probe = probe.firstChild;
  if (selection.anchorNode !== probe && selection.anchorNode !== firstChild) return false;

  // A first run that's still just the placeholder has no real content yet,
  // so any caret position within it (offset 0 or 1) counts as "at start".
  const maxStartOffset = probe.nodeType === 3 && probe.textContent === EMPTY_RUN_PLACEHOLDER ? 1 : 0;
  return selection.anchorOffset <= maxStartOffset;
}

/** Symmetric to isCaretAtContainerStart: caret is collapsed at the very last text position of the container's last child. */
function isCaretAtContainerEnd(containerEl) {
  const selection = window.getSelection?.();
  if (!selection || !selection.isCollapsed) return false;
  const lastChild = containerEl.lastChild;
  if (!lastChild) return true;

  if (selection.anchorNode === containerEl) return selection.anchorOffset >= containerEl.childNodes.length;

  let probe = lastChild;
  while (probe && probe.lastChild) probe = probe.lastChild;
  if (selection.anchorNode !== probe && selection.anchorNode !== lastChild) return false;

  const textLength = probe.nodeType === 3 ? (probe.textContent ?? '').length : 0;
  return selection.anchorOffset >= textLength;
}

/**
 * Resolves the sibling of `blockId` in `direction` ('backward' | 'forward')
 * only if it's a non-editable/contentless block (image/video/audio/file
 * embed, divider, ...) — a real leaf/container with actual content returns
 * null here, since Backspace/Delete into *that* is ordinary merge/no-op
 * territory (handled by onBackspaceAtStart), not this select-then-delete
 * flow.
 */
function findAdjacentContentlessSiblingId(store, blockId, direction) {
  const block = store.getBlock(blockId);
  const parent = store.getBlock(block?.parentId);
  if (!parent) return null;
  const index = parent.contentIds.indexOf(blockId);
  const adjacentIndex = direction === 'backward' ? index - 1 : index + 1;
  if (adjacentIndex < 0 || adjacentIndex >= parent.contentIds.length) return null;
  const adjacentId = parent.contentIds[adjacentIndex];
  return isContentlessBlock(store, store.getBlock(adjacentId)) ? adjacentId : null;
}

/**
 * Dispatches one run's id to the right renderer: TextRunSpan for text, the
 * inline registry's component otherwise. Also passes `blockId` (the
 * containing leaf block — a paragraph, or a table cell) down to atomic
 * components — runs themselves have no parent back-reference in the store,
 * so this is the only place that can hand it to them. Most inline types
 * ignore it (select/date/custom field types are self-contained); it exists for types
 * like a table's select column that need to resolve their own containing
 * cell/row/table to read shared, column-level state.
 */
function RunNode({ id, blockId, host, inlineRegistry, onValueSynced }) {
  const run = useRun(id);
  if (!run) return null;
  if (run.type === 'text') return <TextRunSpan id={id} host={host} onValueSynced={onValueSynced} />;

  const entry = inlineRegistry?.get(run.type);
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[block-editor] No inline type registered for "${run.type}" (run: ${id})`);
    }
    return null;
  }
  const Component = entry.component;
  return <Component id={id} blockId={blockId} />;
}

/**
 * Creates (once) or reuses the persistent DOM element that hosts one run's
 * content — `data-run-id`, and for atomic (non-text) runs `contentEditable=
 * "false"`, live on this element, not on anything React renders into it.
 * The host is looked up directly from the store (not the `useRun` hook)
 * because this only needs to run once per id, at creation time — a run's
 * type never changes after creation (a semantic change always creates a
 * new run with a new id elsewhere in this codebase), so there's nothing to
 * keep reactive here.
 */
function getOrCreateHost(hostsMap, store, id) {
  let host = hostsMap.get(id);
  if (!host) {
    host = document.createElement('span');
    host.dataset.runId = id;
    const run = store.getRun(id);
    if (run && run.type !== 'text') host.setAttribute('contenteditable', 'false');
    hostsMap.set(id, host);
  }
  return host;
}

/**
 * Renders every run of a leaf block (paragraph/heading/tableCell's own
 * contentIds, or a listItem's props.titleRunIds) inside ONE shared
 * contentEditable region — replacing the old one-contentEditable-per-run
 * model. This is what lets the browser's native selection/typing/cursor
 * movement work across formatting boundaries and atomic inline elements
 * (a select/date chip), instead of each run being its own disconnected
 * editable island.
 *
 * Every run — text or atomic — gets a persistent "host" DOM element that
 * *this component creates, positions, and removes imperatively* (see
 * hostsRef/getOrCreateHost and the layout effect below); React only ever
 * renders each run's *content* into its host via `createPortal`. React's
 * own fiber tree therefore never owns the operation of inserting or
 * removing a run's DOM node relative to its siblings — that's the same
 * technique Lexical uses for its "decorator" nodes. It's what closes the
 * "NotFoundError: removeChild ... not a child of this node" crash for
 * good: that error was always React's commit phase trying to remove a
 * host node the *browser* had already ripped out natively (via Backspace/
 * Delete, typing over a selection, word-delete, autocorrect, IME, drag —
 * there is no finite list of native paths that can do this). Since React
 * no longer has a fiber responsible for that removal at all, no native
 * mutation of a run's DOM node can ever race against — or be duplicated
 * by — a React-driven one.
 *
 * `runIds` must come from the caller's own `useBlock` subscription
 * (block.contentIds for paragraph/heading/tableCell, or
 * block.props.titleRunIds for a listItem) — that's what keeps this
 * component reactive to *structural* changes (e.g. a mark-toggle split),
 * while each individual run's *value* reactivity is owned by RunNode/
 * TextRunSpan subscribing to that one run id themselves.
 */
export function EditableBlockContent({
  blockId,
  runIds,
  dir = 'auto',
  onEnter,
  onBackspaceAtStart,
  onDeleteAtEnd,
  onArrowUp,
  onArrowDown,
  onTab,
  onShiftTab,
  onAutoformat,
}) {
  const store = useEditorStore();
  const inlineRegistry = useInlineRegistry();
  const { getSelectedBlockId, setSelectedBlockId } = useSelectedBlock();
  const containerRef = useRef(null);
  // IME composition (CJK/Korean/etc.) produces a sequence of transient,
  // uncommitted `input` events while the user is still choosing characters.
  // Reconciling — and possibly rewriting DOM text — mid-composition would
  // fight the browser/OS IME UI and can cut a composition session short.
  // Defer reconciliation until compositionend commits the final text.
  const isComposingRef = useRef(false);
  const hostsRef = useRef(new Map()); // runId -> persistent host DOM element (see getOrCreateHost)

  // Keeps containerRef's *actual* DOM children (the hosts) in the same
  // membership/order as runIds — the only place any run's DOM node is ever
  // inserted or removed. Runs on every runIds change (structural edits:
  // insert/remove/reorder/split); ordinary text edits don't change runIds
  // at all, so this doesn't run on every keystroke.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const liveIds = new Set(runIds);
    for (const [id, host] of hostsRef.current) {
      if (!liveIds.has(id)) {
        host.remove();
        hostsRef.current.delete(id);
      }
    }

    let previous = null;
    for (const id of runIds) {
      const host = hostsRef.current.get(id);
      if (!host) continue; // created synchronously during render, in the map already
      const expectedNext = previous ? previous.nextSibling : container.firstChild;
      if (expectedNext !== host) container.insertBefore(host, expectedNext);
      previous = host;
    }
  }, [runIds]);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const currentRuns = runIds.map((id) => store.getRun(id)).filter(Boolean);
    const { runs: nextRuns, changed, onlyValueChanges } = reconcileDomToRuns(container, currentRuns);
    if (!changed) return;

    if (onlyValueChanges) {
      nextRuns.forEach((run, i) => {
        if (run !== currentRuns[i]) store.applyOperation(updateRun(run.id, { value: run.value }));
      });
      // A markdown shortcut (e.g. "1. " -> ordered list) always types into a
      // single existing run, never a structural DOM change, so it only ever
      // applies on this branch. On a match, blockId's block was just
      // replaced by a different type — the container/wrapper this callback
      // is running inside of is about to unmount, so there's nothing left
      // here to sync.
      if (onAutoformat?.(nextRuns)) return;
    } else {
      // Same "never zero runs" guard as removeRun — belt-and-suspenders,
      // since reconcileDomToRuns normally never drops a matched run.
      store.applyOperation(
        setBlockRuns(blockId, nextRuns.length ? nextRuns : [{ id: genId(), type: 'text', value: '', marks: {} }]),
      );
    }
    syncEmptyAttr(container, nextRuns);
  }, [store, blockId, runIds, onAutoformat]);

  const syncEmptyFromStore = useCallback(() => {
    syncEmptyAttr(
      containerRef.current,
      runIds.map((id) => store.getRun(id)).filter(Boolean),
    );
  }, [store, runIds]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    handleInput(); // reconcile now that the composed text has been committed
  }, [handleInput]);

  const removeRun = useCallback(
    (runId) => {
      const currentRuns = runIds.map((id) => store.getRun(id)).filter(Boolean);
      const nextRuns = currentRuns.filter((run) => run.id !== runId);
      // Never leave the block with zero runs: an empty contentEditable
      // region (no children at all) isn't a valid caret anchor in most
      // browsers, so the very next keystroke lands on the *container*
      // instead of any run, producing a stray untracked text node that
      // reconcileDomToRuns can't ever match back to an existing run —
      // every keystroke after that mints a brand new run+host instead of
      // updating one in place (the "characters double" bug).
      store.applyOperation(
        setBlockRuns(blockId, nextRuns.length ? nextRuns : [{ id: genId(), type: 'text', value: '', marks: {} }]),
      );
    },
    [store, blockId, runIds],
  );

  /**
   * The common convention for a non-editable neighbor (image/video/
   * audio/file embed, divider): the first Backspace/Delete that reaches it
   * only selects/highlights it (see the be-block-selected class toggled by
   * setSelectedBlockId); a second press while it's already selected is
   * what actually removes it. Neither press ever touches or refocuses
   * *this* block — the caret never moves, since only the neighbor is
   * selected or removed, not anything in the block the user is actually
   * typing in.
   */
  const selectOrDeleteContentlessNeighbor = useCallback(
    (neighborId) => {
      if (getSelectedBlockId() === neighborId) {
        store.applyOperation(removeBlock(neighborId));
        setSelectedBlockId(null);
      } else {
        setSelectedBlockId(neighborId);
      }
    },
    [store, getSelectedBlockId, setSelectedBlockId],
  );

  /**
   * Catches every native content-editable mutation that can rip an atomic
   * run's DOM node out directly — not just Backspace/Delete, but typing a
   * replacement character over a selection that spans a chip, Ctrl/Cmd+
   * Backspace word/line delete, and cut — all of which fire `beforeinput`
   * with the exact range about to be affected (`getTargetRanges()`, falling
   * back to the live selection where unsupported). When that range touches
   * an atomic run, this computes the resulting content itself and applies
   * it through the store, so the browser never gets to mutate that node.
   * Ordinary text-only edits are untouched: computeRunsAfterRangeDeletion
   * returns null for them and this handler is a no-op, leaving the existing
   * fast-path onInput reconciliation to handle typing exactly as before.
   */
  const handleBeforeInput = useCallback(
    (event) => {
      if (isComposingRef.current) return;

      // A native `beforeinput` (or `input`, elsewhere) fired by a real form
      // control nested inside an atomic run's own host (the checkbox
      // label's <input>, a date chip's <input type="date">, ...) still
      // bubbles up through this contenteditable=true container, even
      // though that host is contenteditable="false" and typing into it has
      // nothing to do with the surrounding text flow. Left unguarded, the
      // fallback to window.getSelection() below can pick up a *stale*
      // range still pointing at that atomic run's position from before
      // focus moved into its nested control, get misread as "this range
      // touches an atomic run," and rewrite it clean out of the block —
      // the exact "typing in the checkbox's label deletes the checkbox"
      // bug this guard closes. That nested control owns its own value via
      // its own onChange; this container-level pipeline must stay out of
      // it entirely.
      if (event.target instanceof Node) {
        const el = event.target.nodeType === 1 ? event.target : event.target.parentElement;
        if (el?.closest?.('[contenteditable="false"]')) return;
      }

      const inputType = event.inputType ?? '';
      const isDelete = inputType.startsWith('delete');
      const isReplaceTyped = inputType === 'insertText' || inputType === 'insertReplacementText';
      if (!isDelete && !isReplaceTyped) return;

      const container = containerRef.current;
      if (!container) return;

      const targetRanges = event.getTargetRanges?.();
      const selection = window.getSelection?.();
      const range = targetRanges?.[0] ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
      if (!range) return;
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return;

      const result = computeRunsAfterRangeDeletion(container, runIds, (id) => store.getRun(id), range);
      if (!result) return; // no atomic run in range: let native/existing handling proceed unchanged

      event.preventDefault();
      let { nextRuns, insertionIndex } = result;

      let focusRunId = null;
      let focusAtStart = false;

      if (isReplaceTyped && event.data) {
        const typedRun = { id: genId(), type: 'text', value: event.data, marks: {} };
        nextRuns = [...nextRuns.slice(0, insertionIndex), typedRun, ...nextRuns.slice(insertionIndex)];
        focusRunId = typedRun.id;
        focusAtStart = false;
      } else if (insertionIndex > 0) {
        focusRunId = nextRuns[insertionIndex - 1]?.id;
        focusAtStart = false;
      } else if (nextRuns.length > 0) {
        focusRunId = nextRuns[0].id;
        focusAtStart = true;
      }

      const finalRuns = nextRuns.length ? nextRuns : [{ id: genId(), type: 'text', value: '', marks: {} }];
      store.applyOperation(setBlockRuns(blockId, finalRuns));

      const landingRunId = focusRunId ?? finalRuns[0].id;
      if (focusAtStart) focusRunStart(landingRunId);
      else focusRunEnd(landingRunId);
    },
    [store, blockId, runIds],
  );

  // React's `onBeforeInput` JSX prop does NOT correspond to the native
  // `beforeinput` event — it's a legacy pre-InputEvent-spec polyfill
  // synthesized from keypress/textInput/composition events, so it never
  // fires for Backspace/Delete/word-delete and carries no `inputType` or
  // `getTargetRanges()`. Attaching a real native listener directly (same
  // pattern useEditorKeyboardShortcuts uses for its own native handling)
  // is the only way to actually observe and cancel these before the
  // browser mutates an atomic run's DOM node itself.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.addEventListener('beforeinput', handleBeforeInput);
    return () => container.removeEventListener('beforeinput', handleBeforeInput);
  }, [handleBeforeInput]);

  const handleKeyDown = useCallback(
    (event) => {
      // While composing, Enter/Backspace/arrows are the IME's own candidate-
      // selection UI (confirming a suggestion, moving between candidates) —
      // must not also trigger this block's own Enter/merge/navigation.
      if (isComposingRef.current) return;

      if (event.key === 'Enter' && onEnter) {
        event.preventDefault();
        onEnter(event);
        return;
      }
      if (event.key === 'Backspace') {
        const container = containerRef.current;
        const wholeId = container && findWhollySelectedAtomicRunId(container, runIds, store.getRun.bind(store));
        if (wholeId) {
          event.preventDefault();
          removeRun(wholeId);
          return;
        }
        const atomicId = container && findAdjacentAtomicRunId(container, runIds, store.getRun.bind(store), true);
        if (atomicId) {
          event.preventDefault();
          removeRun(atomicId);
          return;
        }
        if (container && isCaretAtContainerStart(container)) {
          // Only offer the select-then-delete flow for a non-editable
          // neighbor when THIS block still has real content of its own —
          // an empty current block (e.g. a trailing blank paragraph right
          // after an image) must disappear on its own first, exactly like
          // Backspace on any other empty block, before the neighbor is
          // offered at all. Otherwise the very first Backspace on an empty
          // paragraph would highlight the image instead of removing the
          // paragraph, which is backwards. onBackspaceAtStart (the normal
          // merge/delete path) handles the empty case, and itself lands on
          // selecting the neighbor via focusAfterMerge once there's
          // nothing left of the current block to focus back into.
          const isCurrentEmpty = isRunsEmpty(store, runIds);
          if (!isCurrentEmpty) {
            const neighborId = findAdjacentContentlessSiblingId(store, blockId, 'backward');
            if (neighborId) {
              event.preventDefault();
              selectOrDeleteContentlessNeighbor(neighborId);
              return;
            }
          }
          // Always claim this keypress once we know it's Backspace-at-
          // absolute-start being handled here (native backspace has nothing
          // to do at this exact position anyway, so this is a no-op for the
          // browser) — this is what lets the global handler in
          // useEditorKeyboardShortcuts distinguish "a neighbor was *just*
          // selected as part of *this* keypress" (defaultPrevented is now
          // true, so it must NOT also delete that neighbor on this same
          // press) from "a neighbor was already selected from a *previous*
          // keypress" (a fresh event, defaultPrevented starts false again,
          // so the global handler correctly deletes it then).
          event.preventDefault();
          if (onBackspaceAtStart) onBackspaceAtStart(event);
        }
        return;
      }
      if (event.key === 'Delete') {
        const container = containerRef.current;
        const wholeId = container && findWhollySelectedAtomicRunId(container, runIds, store.getRun.bind(store));
        if (wholeId) {
          event.preventDefault();
          removeRun(wholeId);
          return;
        }
        const atomicId = container && findAdjacentAtomicRunId(container, runIds, store.getRun.bind(store), false);
        if (atomicId) {
          event.preventDefault();
          removeRun(atomicId);
          return;
        }
        if (container && isCaretAtContainerEnd(container)) {
          const neighborId = findAdjacentContentlessSiblingId(store, blockId, 'forward');
          if (neighborId) {
            event.preventDefault();
            selectOrDeleteContentlessNeighbor(neighborId);
            return;
          }
          if (onDeleteAtEnd) onDeleteAtEnd(event);
        }
        return;
      }
      if (event.key === 'ArrowUp' && onArrowUp) {
        event.preventDefault();
        onArrowUp(event);
        return;
      }
      if (event.key === 'ArrowDown' && onArrowDown) {
        event.preventDefault();
        onArrowDown(event);
        return;
      }
      if (event.key === 'Tab') {
        if (event.shiftKey && onShiftTab) {
          event.preventDefault();
          onShiftTab(event);
        } else if (!event.shiftKey && onTab) {
          event.preventDefault();
          onTab(event);
        }
      }
    },
    [
      onEnter,
      onBackspaceAtStart,
      onDeleteAtEnd,
      onArrowUp,
      onArrowDown,
      onTab,
      onShiftTab,
      removeRun,
      selectOrDeleteContentlessNeighbor,
      runIds,
      blockId,
      store,
    ],
  );

  return (
    <>
      <span
        ref={containerRef}
        className="be-editable"
        dir={dir}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
      >
        {runIds.map((id) => {
          const host = getOrCreateHost(hostsRef.current, store, id);
          return createPortal(
            <RunNode
              key={id}
              id={id}
              blockId={blockId}
              host={host}
              inlineRegistry={inlineRegistry}
              onValueSynced={syncEmptyFromStore}
            />,
            host,
          );
        })}
      </span>
      <LinkHoverCard containerRef={containerRef} store={store} />
    </>
  );
}
