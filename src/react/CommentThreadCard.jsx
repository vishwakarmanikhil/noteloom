import { useState } from 'react';
import { replyToComment, resolveComment, deleteComment } from '../comments/comments.js';
import { CommentComposer } from './CommentComposer.jsx';
import { CommentAvatar } from './CommentAvatar.jsx';
import { formatRelativeTime } from './commentFormatting.js';
import { CommentIcon, CheckIcon, TrashIcon } from './icons.jsx';

function CommentMessageRow({ message, size = 26 }) {
  return (
    <div className="be-comment-message">
      <CommentAvatar authorId={message.authorId} size={size} />
      <div className="be-comment-message-body">
        <div className="be-comment-message-header">
          <span className="be-comment-message-author">{message.authorId}</span>
          <span className="be-comment-message-time">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <p className="be-comment-message-text">{message.text}</p>
      </div>
    </div>
  );
}

/**
 * One comment thread — the original message, then any replies (visually
 * indented with a connecting line, chat-thread style), then either a Reply
 * composer (once clicked) or the Reply/Resolve/Delete action row. Shared by
 * both places a thread can be viewed: CommentPopover (click/hover on the
 * highlighted text) and CommentsPanel (the opt-in right-side sidebar) —
 * one implementation, so the two surfaces can't drift apart.
 *
 * Resolve/Delete act on the whole thread (this package's data model has no
 * per-reply resolve/delete — see CommentThread in the README), so the
 * action row sits once below every message, not per message.
 *
 * `authorId`, if not given, hides the Reply action entirely (composing a
 * message needs an author; resolving/deleting don't, so those stay
 * available either way) — see NoteloomEditor's `commentAuthorId` prop.
 */
export function CommentThreadCard({ store, thread, authorId }) {
  const [isReplying, setIsReplying] = useState(false);
  const [rootMessage, ...replies] = thread.messages;

  function handleReplySubmit(text) {
    replyToComment(store, thread.id, { authorId, text });
    setIsReplying(false);
  }

  return (
    <div className={`be-comment-thread${thread.resolved ? ' be-comment-thread-resolved' : ''}`}>
      <CommentMessageRow message={rootMessage} />

      {replies.length > 0 && (
        <div className="be-comment-thread-replies">
          {replies.map((m) => (
            <CommentMessageRow key={m.id} message={m} size={22} />
          ))}
        </div>
      )}

      {isReplying ? (
        <CommentComposer authorId={authorId} placeholder="Reply…" autoFocus onSubmit={handleReplySubmit} onCancel={() => setIsReplying(false)} />
      ) : (
        <div className="be-comment-thread-actions">
          {/* No literal space between the icon and label -- CSS gap (see
              .be-comment-thread-actions button) handles the visual spacing,
              so button.textContent stays exactly "Reply"/"Resolve"/"Reopen". */}
          {authorId && (
            <button type="button" onClick={() => setIsReplying(true)}>
              <CommentIcon size={13} />
              Reply
            </button>
          )}
          <button type="button" onClick={() => resolveComment(store, thread.id, !thread.resolved)}>
            <CheckIcon size={13} />
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button
            type="button"
            className="be-comment-thread-delete"
            onClick={() => deleteComment(store, thread.id)}
            aria-label="Delete comment"
            title="Delete comment"
          >
            <TrashIcon size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
