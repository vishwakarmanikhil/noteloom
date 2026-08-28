import { useCallback, useState } from 'react';

/**
 * Generic "drag a handle -> live-preview local state -> commit once on
 * release" hook — extracted from `EmbedBlock.jsx`'s own inlined resize-drag
 * pattern (`mousedown` on a handle attaches `document`-level `mousemove`/
 * `mouseup`; `mousemove` only updates local state for a live preview, zero
 * store writes; `mouseup` removes both listeners and makes exactly ONE
 * commit) — the canvas block needs this identical shape a second time.
 * Deliberately NOT also wired into `EmbedBlock.jsx`/`TableHeaderRow.jsx` in
 * this same change — that would touch already-working, already-tested
 * files for no reason tied to this feature; a later, separate cleanup task
 * could migrate them onto this shared hook if desired.
 *
 * `compute(event, start)` embeds the caller's own geometry — `start` is
 * whatever snapshot the caller captured when the drag began (e.g.
 * `{ startX, startY, startWidth, startHeight }`); `compute` returns the
 * caller's own value shape (a plain number, or an object like
 * `{ width, height }`). `onCommit(value)` is called exactly once, on
 * release, with the final computed value.
 *
 * Returns `{ dragValue, startDrag }` — `dragValue` is the live in-progress
 * value (`null` when not dragging, for the caller's own
 * `effective = dragValue ?? committedValue` pattern); `startDrag(event,
 * start)` is the `onMouseDown` handler to wire onto the resize handle.
 */
export function useDragResize({ compute, onCommit }) {
  const [dragValue, setDragValue] = useState(null);

  const startDrag = useCallback(
    (event, start) => {
      event.preventDefault();
      const handleMouseMove = (moveEvent) => setDragValue(compute(moveEvent, start));
      const handleMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onCommit(compute(upEvent, start));
        setDragValue(null);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [compute, onCommit],
  );

  return { dragValue, startDrag };
}
