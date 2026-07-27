import { useRef, useState } from 'react';
import { CommentAvatar } from './CommentAvatar.jsx';
import { SendIcon } from './icons.jsx';

/**
 * Avatar + auto-growing textarea, with a Send (and optional Cancel) button
 * on their own row below — the one shared "compose a comment message" UI
 * used for both a brand-new comment (FloatingToolbar's Comment button, once
 * an authorId is configured) and a reply (CommentThreadCard). Deliberately
 * not a modal: it's meant to sit inline inside a small popover/panel,
 * matching the "minimal UI" goal rather than interrupting with a full
 * dialog the way LinkEditModal does for a fundamentally different, rarer
 * action (editing a URL).
 *
 * The textarea starts at 2 rows and grows with content up to 5 (see
 * `.be-comment-composer-textarea`'s min/max-height plus the resize-on-input
 * below), then scrolls — comfortable for more than a one-line reply without
 * the composer itself growing unbounded.
 *
 * `authorId` only renders the composer's own avatar (a preview of who's
 * about to post) — it does NOT decide who the message is attributed to;
 * the caller still passes `authorId` to `addComment`/`replyToComment`
 * itself. Ctrl/Cmd+Enter submits, Escape cancels (if `onCancel` is given)
 * — a plain Enter stays newline-friendly now that there's room for more
 * than one line.
 */
export function CommentComposer({ authorId, placeholder = 'Add a comment…', autoFocus = false, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const trimmed = text.trim();

  function resizeToContent() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleChange(event) {
    setText(event.target.value);
    resizeToContent();
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = '';
  }

  return (
    <form className="be-comment-composer" onSubmit={handleSubmit}>
      <div className="be-comment-composer-input-row">
        <CommentAvatar authorId={authorId} size={26} />
        <textarea
          ref={textareaRef}
          className="be-comment-composer-textarea"
          value={text}
          onChange={handleChange}
          placeholder={placeholder}
          rows={2}
          autoFocus={autoFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleSubmit(event);
            else if (event.key === 'Escape' && onCancel) onCancel();
          }}
        />
      </div>
      <div className="be-comment-composer-actions">
        {onCancel && (
          <button type="button" className="be-comment-composer-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="be-comment-composer-submit" disabled={!trimmed}>
          <SendIcon size={13} />
          Send
        </button>
      </div>
    </form>
  );
}
