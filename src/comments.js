// noteloom/comments — range-anchored comment threads (add/reply/resolve/delete),
// the built-in comment mark commands, and the ready-made comment UI. Opt-in
// entry point; also still re-exported from the main `noteloom` entry for
// backward compatibility (removed in 2.0 — see docs/repackaging-plan.md).

export { addComment, replyToComment, resolveComment, deleteComment } from './comments/comments.js';
export { addCommentMarkOverRange, removeCommentMarkEverywhere } from './comments/commentMarks.js';
export { useComments } from './react/useComments.js';
export { useCommentAuthorId } from './react/EditorProvider.jsx';
export { CommentsPanel } from './react/CommentsPanel.jsx';
export { CommentThreadCard } from './react/CommentThreadCard.jsx';
export { CommentComposer } from './react/CommentComposer.jsx';
export { CommentAvatar } from './react/CommentAvatar.jsx';
