import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAutoAdjustedPosition } from './useAutoAdjustedPosition.js';
import { CommentThreadCard } from './CommentThreadCard.jsx';
import { CommentPopoverHeader } from './CommentPopoverHeader.jsx';
import { useHoveredComment } from './EditorProvider.jsx';

/**
 * The click-or-hover popover for VIEWING/replying to/resolving/deleting an
 * EXISTING comment thread over highlighted text (`.be-comment-highlight`,
 * see commentMarks.js) — the read/react counterpart to FloatingToolbar's
 * Comment button, which only handles *creating* a new comment over a fresh
 * selection. Mirrors LinkHoverCard's exact hover-card mechanism (same
 * container-level mouseover/mouseout listening, same hide-timer dance,
 * mounted the same way in EditableBlockContent.jsx) but additionally opens
 * (and stays open, "pinned") on a plain click, since a comment is more often
 * something you deliberately open than glance at in passing.
 *
 * A run can carry more than one `commentIds` entry (overlapping comments) —
 * every thread attached to the clicked/hovered run is shown, stacked,
 * inside one popover.
 */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function CommentPopover({ containerRef, store, authorId }) {
  const [target, setTarget] = useState(null); // { rect, commentIds } | null
  const [pinned, setPinned] = useState(false);
  const hideTimerRef = useRef(null);
  const popoverRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [, setHoveredCommentId] = useHoveredComment();

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setTarget((prev) => (pinned ? prev : null));
    }, 250);
  }, [clearHideTimer, pinned]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const findCommentRun = (el) => {
      const runEl = el?.closest?.('[data-run-id]');
      if (!runEl || !container.contains(runEl)) return null;
      const commentIds = store.getRun(runEl.dataset.runId)?.marks?.commentIds;
      if (!commentIds?.length) return null;
      return { runEl, commentIds };
    };

    const handleMouseOver = (event) => {
      const found = findCommentRun(event.target);
      if (!found) return;
      clearHideTimer();
      setTarget((prev) =>
        prev && prev.runEl === found.runEl
          ? prev
          : {
              rect: found.runEl.getBoundingClientRect(),
              commentIds: found.commentIds,
              runEl: found.runEl,
            },
      );
    };
    const handleMouseOut = () => scheduleHide();

    const handleClick = (event) => {
      const found = findCommentRun(event.target);
      if (!found) {
        setPinned(false);
        setTarget(null);
        return;
      }
      clearHideTimer();
      setPinned(true);
      setTarget({
        rect: found.runEl.getBoundingClientRect(),
        commentIds: found.commentIds,
        runEl: found.runEl,
      });
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      container.removeEventListener('click', handleClick);
    };
  }, [containerRef, store, clearHideTimer, scheduleHide]);

  // Outside-click / Escape closes a pinned (click-opened) popover -- a
  // click landing inside the popover itself (portaled to document.body, so
  // outside `container`) doesn't count as "outside".
  useEffect(() => {
    if (!target) return undefined;
    const handlePointerDown = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      if (containerRef.current?.contains(event.target)) return; // handled by handleClick above
      setPinned(false);
      setTarget(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setTarget(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [target, containerRef]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  // Echoes onto the matching thread card in the panel, if one's rendered --
  // see useHoveredComment.
  useEffect(() => {
    setHoveredCommentId(target?.commentIds?.[0] ?? null);
  }, [target, setHoveredCommentId]);

  const closePopover = useCallback(() => {
    setPinned(false);
    setTarget(null);
  }, []);

  const isOpen = Boolean(target);
  const position = useAutoAdjustedPosition(
    popoverRef,
    isOpen,
    target ? target.rect.bottom + 6 : null,
    target ? target.rect.left : null,
  );

  // Only a "pinned" (click-)opened popover takes focus — a hover preview
  // must never steal focus away from wherever the user is actually typing
  // just because their mouse passed over a comment highlight. Mirrors
  // Modal.jsx's own one-time move-in-on-open / move-back-out-on-close
  // (not a focus trap), keyed on `pinned` rather than a generic `isOpen`.
  //
  // Also depends on `position` (not just `pinned`) for the same reason the
  // Select popover's own "focus the search input on open" effect needed a
  // matching fix this session: `position` starts `null` and the popover
  // returns nothing (see the `if (!isOpen || !position) return null` below)
  // until useAutoAdjustedPosition resolves it, so `popoverRef.current` is
  // still null on the exact render `pinned` first flips true. `didFocusRef`
  // guards against re-running the actual focus-move once `position` is
  // merely re-clamped afterward.
  const didFocusRef = useRef(false);
  useEffect(() => {
    if (pinned && popoverRef.current && !didFocusRef.current) {
      didFocusRef.current = true;
      previouslyFocusedRef.current = document.activeElement;
      const focusable = popoverRef.current.querySelector(FOCUSABLE_SELECTOR);
      (focusable ?? popoverRef.current).focus();
    } else if (!pinned && didFocusRef.current) {
      didFocusRef.current = false;
      previouslyFocusedRef.current?.focus?.();
      previouslyFocusedRef.current = null;
    }
  }, [pinned, position]);

  if (!isOpen || !position) return null;

  const threads = target.commentIds.map((id) => store.getComment(id)).filter(Boolean);
  if (threads.length === 0) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="be-comment-popover"
      contentEditable={false}
      style={{ position: 'fixed', top: position.top, left: position.left }}
      onMouseEnter={clearHideTimer}
      onMouseLeave={scheduleHide}
      role="dialog"
      aria-modal={pinned || undefined}
      aria-label={`Comments (${threads.length})`}
      tabIndex={-1}
    >
      <CommentPopoverHeader title={`Comments (${threads.length})`} onClose={closePopover} />
      {threads.map((thread) => (
        <CommentThreadCard key={thread.id} store={store} thread={thread} authorId={authorId} />
      ))}
    </div>,
    document.body,
  );
}
