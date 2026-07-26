import { useEditorStore } from './EditorProvider.jsx';
import { useComments } from './useComments.js';
import { CommentThreadCard } from './CommentThreadCard.jsx';

/**
 * The opt-in right-side comments panel (Notion/Google Docs-style) — every
 * thread in the document, unresolved first, each rendered via the same
 * CommentThreadCard the click-to-view CommentPopover uses (one reply/
 * resolve/delete implementation, two surfaces). Mount automatically via
 * `<NoteloomEditor showCommentsPanel commentAuthorId="...">`, or render it
 * yourself anywhere under an `<EditorProvider>` for the granular API.
 *
 * `position: fixed` by default (see `.be-comments-panel` in style.css) so
 * it works with zero host layout changes; override that rule (or wrap it
 * in your own positioned container) for a different placement.
 */
export function CommentsPanel({ authorId }) {
  const store = useEditorStore();
  const comments = useComments();
  const sorted = [...comments].sort((a, b) => Number(a.resolved) - Number(b.resolved));

  return (
    <div className="be-comments-panel" contentEditable={false}>
      <div className="be-comments-panel-header">Comments{sorted.length > 0 ? ` (${sorted.length})` : ''}</div>
      {sorted.length === 0 ? (
        <p className="be-comments-panel-empty">No comments yet.</p>
      ) : (
        <div className="be-comments-panel-list">
          {sorted.map((thread) => (
            <CommentThreadCard key={thread.id} store={store} thread={thread} authorId={authorId} />
          ))}
        </div>
      )}
    </div>
  );
}
