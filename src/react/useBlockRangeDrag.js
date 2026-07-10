import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore, useBlockRangeSelection } from './EditorProvider.jsx';

// Minimum pointer movement (px) before a press counts as an actual drag —
// below this, mouseup fires with nothing selected at all. Keeps a plain
// click in the margin (mousedown+mouseup with no real movement) from
// selecting a block; only a genuine drag gesture does.
const DRAG_THRESHOLD_PX = 4;

/** Ids of `anchorId`..`hoverId` inclusive, in document order, among their shared parent's siblings. */
function computeRange(store, anchorId, hoverId) {
  const anchorBlock = store.getBlock(anchorId);
  if (!anchorBlock) return [];
  const parent = store.getBlock(anchorBlock.parentId);
  if (!parent) return [anchorId];

  const ids = parent.contentIds;
  const anchorIndex = ids.indexOf(anchorId);
  const hoverIndex = hoverId ? ids.indexOf(hoverId) : anchorIndex;
  if (anchorIndex === -1) return [anchorId];
  const [from, to] = hoverIndex === -1 ? [anchorIndex, anchorIndex] : [Math.min(anchorIndex, hoverIndex), Math.max(anchorIndex, hoverIndex)];
  return ids.slice(from, to + 1);
}

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

/**
 * Notion-style "drag in the margin to select a run of blocks" mechanic.
 * Call this ONCE (e.g. in EditorSurface), passing the same containerRef the
 * rest of the surface's own trigger hooks use — it registers a single
 * document-level mousedown listener that decides, per press, whether it
 * landed somewhere that COULD start a block-range drag:
 *
 *  - Inside a block row's own DOM box (data-block-row-id) but OUTSIDE its
 *    rendered content (be-block-row-content) — covers both the narrow
 *    per-block gutter (the +/grip buttons sit there too, so those are
 *    explicitly excluded) and any empty space to a short block's right.
 *  - Entirely outside every row's own box, but still within this editor's
 *    container — covers the wide blank page margins on either side of the
 *    content column (`.be-surface`'s own `max-width` centering), found by
 *    whichever row's vertical span contains the click's Y coordinate.
 *
 * That press only becomes an actual selection once the pointer has moved
 * at least DRAG_THRESHOLD_PX from where it went down — a plain click
 * (mousedown immediately followed by mouseup, no real movement) selects
 * nothing at all. This is a genuine drag-to-select gesture, not a
 * click-to-select one; a single block can still be selected by dragging a
 * few pixels within its own row.
 *
 * A press directly on the actual editable content (inside
 * be-block-row-content) is deliberately left alone either way, so normal
 * click-to-place-caret and native text selection are never hijacked.
 *
 * Disabled entirely on coarse-pointer (touch) devices — dragging in the
 * margin would fight the page's own scroll gesture there, and there's no
 * equivalent "hover to reveal the gutter" affordance on touch anyway.
 */
export function useBlockRangeDrag(containerRef) {
  const store = useEditorStore();
  const [, setSelectedBlockRange] = useBlockRangeSelection();
  const anchorIdRef = useRef(null); // set from mousedown onward, whether or not the drag has "armed" yet
  const isArmedRef = useRef(false); // true only once movement has passed DRAG_THRESHOLD_PX
  const startPointRef = useRef(null);

  const handleMouseMove = useCallback(
    (event) => {
      if (!anchorIdRef.current) return;

      if (!isArmedRef.current) {
        const { x, y } = startPointRef.current ?? { x: event.clientX, y: event.clientY };
        const movedPx = Math.hypot(event.clientX - x, event.clientY - y);
        if (movedPx < DRAG_THRESHOLD_PX) return;
        isArmedRef.current = true;
        // Suppresses native text selection for the rest of this drag —
        // preventDefault alone isn't enough once the pointer has crossed
        // into real block content: the browser may have already latched
        // onto that content as a fresh selection anchor. `user-select:none`
        // on the document root is the standard belt-and-braces fix (see
        // `.be-block-range-dragging` in the example app's CSS), removed the
        // instant the drag ends.
        document.documentElement.classList.add('be-block-range-dragging');
        window.getSelection?.()?.removeAllRanges();
      }
      // Also keep clearing it on every subsequent move — some browsers
      // still extend a selection that started a frame earlier even with
      // user-select:none applied mid-gesture.
      window.getSelection?.()?.removeAllRanges();
      event.preventDefault();

      const el = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-block-row-id]');
      const hoverId = el?.getAttribute('data-block-row-id') ?? null;
      setSelectedBlockRange(computeRange(store, anchorIdRef.current, hoverId));
    },
    [store, setSelectedBlockRange],
  );

  const handleMouseUp = useCallback(() => {
    anchorIdRef.current = null;
    isArmedRef.current = false;
    startPointRef.current = null;
    document.documentElement.classList.remove('be-block-range-dragging');
  }, []);

  const armDrag = useCallback((blockId, event) => {
    anchorIdRef.current = blockId;
    isArmedRef.current = false;
    startPointRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) return; // left click only
      if (isCoarsePointer()) return;
      if (event.target.closest?.('button, input, textarea, select')) return;

      const row = event.target.closest('[data-block-row-id]');
      if (row) {
        // DOM-ancestor check, not a geometry/rect comparison: the previous
        // rect-based version only compared clientX against
        // be-block-row-content's own bounding box, and (a) never checked Y
        // at all, (b) broke down for any block whose content box isn't a
        // simple full-width rectangle (wrapped text, an inline chip at the
        // end of a short line, a table). Any of those could put a genuine
        // click on real content just outside the rect's clientX range,
        // misclassifying it as "margin" and arming a drag — which doesn't
        // itself steal the click, but does mean the *next* mousemove (even
        // an incidental few px of jitter before the click properly
        // registers) can flip it into an actual drag-select, hijacking
        // what the user experienced as a plain click. Walking the DOM via
        // closest() instead answers "is this element actually inside the
        // block's own rendered content" exactly, with no geometry involved.
        if (event.target.closest('.be-block-row-content')) return;
        armDrag(row.getAttribute('data-block-row-id'), event);
        return;
      }

      // The press landed entirely outside every row's own DOM box — the
      // wide blank page margin on either side of `.be-surface`'s centered
      // content column (that margin is never inside any row's own element,
      // since each row is only ever as wide as the content column itself).
      // Scoped to THIS editor's own rows via containerRef, deliberately
      // NOT via container.contains(event.target) — a blank-margin click's
      // target is by definition outside the container's own narrower box.
      const container = containerRef?.current;
      if (!container) return;
      const rows = [...container.querySelectorAll('[data-block-row-id]')];
      const hovered = rows.find((el) => {
        const r = el.getBoundingClientRect();
        return event.clientY >= r.top && event.clientY <= r.bottom;
      });
      if (hovered) {
        armDrag(hovered.getAttribute('data-block-row-id'), event);
      }
    },
    [containerRef, armDrag],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.documentElement.classList.remove('be-block-range-dragging'); // in case unmounted mid-drag
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);
}
