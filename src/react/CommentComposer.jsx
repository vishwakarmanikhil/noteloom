import { useState } from 'react';
import { CommentAvatar } from './CommentAvatar.jsx';
import { SendIcon, XIcon } from './icons.jsx';

/**
 * A minimal avatar + input + send-button row — the one shared "compose a
 * comment message" UI used for both a brand-new comment (FloatingToolbar's
 * Comment button, once an authorId is configured) and a reply
 * (CommentThreadCard). Deliberately not a modal: it's meant to sit inline
 * inside a small popover/panel, matching the "minimal UI" goal rather than
 * interrupting with a full dialog the way LinkEditModal does for a
 * fundamentally different, rarer action (editing a URL).
 *
 * `authorId` only renders the composer's own avatar (a preview of who's
 * about to post) — it does NOT decide who the message is attributed to;
 * the caller still passes `authorId` to `addComment`/`replyToComment`
 * itself. Enter submits (chat-input convention, matching the single-line-
 * looking pill this renders as), Shift+Enter inserts a newline, Escape
 * cancels (if `onCancel` is given).
 */
export function CommentComposer({ authorId, placeholder = 'Add a comment…', autoFocus = false, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  function handleSubmit(event) {
    event.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }

  return (
    <form className="be-comment-composer" onSubmit={handleSubmit}>
      <CommentAvatar authorId={authorId} size={26} />
      <textarea
        className="be-comment-composer-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event);
          else if (event.key === 'Escape' && onCancel) onCancel();
        }}
      />
      {onCancel && (
        <button type="button" className="be-comment-composer-cancel" onClick={onCancel} aria-label="Cancel">
          <XIcon size={13} />
        </button>
      )}
      <button type="submit" className="be-comment-composer-submit" disabled={!trimmed} aria-label="Send">
        <SendIcon size={14} />
      </button>
    </form>
  );
}
