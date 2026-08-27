import { useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore, useHoveredComment } from './EditorProvider.jsx';
import { useComments } from './useComments.js';
import { CommentThreadCard } from './CommentThreadCard.jsx';

/** Best-effort DOM lookup for where a thread's highlight actually lives right now -- anchorRunIds first (cheap, usually still right), falling back to a full scan (see removeCommentMarkEverywhere's own reasoning on why anchorRunIds can go stale). */
function findAnchorEl(store, thread) {
  for (const id of thread.anchorRunIds ?? []) {
    const el = document.querySelector(`[data-run-id="${id}"]`);
    if (el) return el;
  }
  for (const runId of store.getAllRunIds()) {
    if (store.getRun(runId)?.marks?.commentIds?.includes(thread.id)) {
      const el = document.querySelector(`[data-run-id="${runId}"]`);
      if (el) return el;
    }
  }
  return null;
}

function scrollToComment(store, commentId, setHoveredCommentId) {
  const thread = store.getComment(commentId);
  if (!thread) return;
  const el = findAnchorEl(store, thread);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setHoveredCommentId(commentId);
  setTimeout(
    () => setHoveredCommentId((current) => (current === commentId ? null : current)),
    1500,
  );
}

/**
 * The opt-in right-side comments panel (Notion/Google Docs-style) — every
 * thread in the document, unresolved first, each rendered via the same
 * CommentThreadCard the click-to-view CommentPopover uses (one reply/
 * resolve/delete implementation, two surfaces). Mount automatically via
 * `<NoteloomEditor showCommentsPanel commentAuthorId="...">`, or render it
 * yourself anywhere under an `<EditorProvider>` for the granular API.
 *
 * Each card aligns vertically with its own anchored text (margin-comment
 * style), recomputed on scroll/resize and whenever the thread list changes
 * — a best-effort match against the current DOM (see findAnchorEl), not an
 * exact layout algorithm; closely-spaced comments can still overlap.
 *
 * `position: fixed` by default (see `.be-comments-panel` in style.css) so
 * it works with zero host layout changes; override that rule (or wrap it
 * in your own positioned container) for a different placement.
 */
export function CommentsPanel({ authorId }) {
  const store = useEditorStore();
  const comments = useComments();
  const [, setHoveredCommentId] = useHoveredComment();
  const listRef = useRef(null);
  const [positions, setPositions] = useState({});
  const sorted = [...comments].sort((a, b) => Number(a.resolved) - Number(b.resolved));

  useLayoutEffect(() => {
    function recompute() {
      const list = listRef.current;
      if (!list) return;
      const listTop = list.getBoundingClientRect().top;
      const next = {};
      // Starts at -Infinity (not 0) so a comment whose anchor has scrolled
      // above the panel moves right along with it (off the top, out of
      // view) instead of getting clamped there permanently -- Math.max
      // against a real previous-card position only kicks in to prevent
      // two comments landing on top of each other, never as a floor at 0.
      let cursor = -Infinity;
      for (const thread of sorted) {
        const el = findAnchorEl(store, thread);
        // Falls back to 0 (not `cursor + 90`) when an anchor can't be
        // found at all (e.g. its highlight was stripped by a later edit) --
        // otherwise a single missing anchor at the very start would leave
        // `cursor` at -Infinity forever, propagating through every
        // following card too.
        const natural = el
          ? el.getBoundingClientRect().top - listTop
          : Number.isFinite(cursor)
            ? cursor + 90
            : 0;
        const top = Math.max(cursor, natural);
        next[thread.id] = top;
        cursor = top + 90; // rough per-card minimum before the next one can start, to avoid total overlap
      }
      setPositions(next);
    }
    recompute();
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
    // `comments` (not the locally re-sorted `sorted`, a fresh array every
    // render) is the stable dependency -- useComments() only returns a new
    // reference when the underlying data actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, store]);

  const totalHeight = Object.values(positions).reduce((max, v) => Math.max(max, v + 120), 0);

  if (sorted.length === 0) return null;

  return (
    <div className="be-comments-panel" contentEditable={false}>
      <div ref={listRef} className="be-comments-panel-list" style={{ height: totalHeight }}>
        {sorted.map((thread) => (
          <div
            key={thread.id}
            className="be-comments-panel-item"
            style={{ top: positions[thread.id] ?? 0 }}
          >
            <CommentThreadCard
              store={store}
              thread={thread}
              authorId={authorId}
              onJumpToText={(id) => scrollToComment(store, id, setHoveredCommentId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
