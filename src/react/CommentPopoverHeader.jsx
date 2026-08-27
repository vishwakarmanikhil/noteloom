import { XIcon } from './icons.jsx';

/** Shared title + close-button row for both CommentPopover (viewing existing threads) and FloatingToolbar's standalone "Add comment" composer -- one small header, not duplicated markup in each. */
export function CommentPopoverHeader({ title, onClose }) {
  return (
    <div className="be-comment-popover-header">
      <span className="be-comment-popover-title">{title}</span>
      <button
        type="button"
        className="be-comment-popover-close"
        onClick={onClose}
        aria-label="Close"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
