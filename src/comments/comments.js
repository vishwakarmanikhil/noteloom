import { genId } from '../utils/idGen.js';
import {
  addCommentThread as addCommentThreadOp,
  removeCommentThread as removeCommentThreadOp,
  addCommentReply as addCommentReplyOp,
  resolveComment as resolveCommentOp,
} from '../store/operations.js';
import { addCommentMarkOverRange, removeCommentMarkEverywhere } from './commentMarks.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Creates a comment thread anchored to `range` ({ blockId, startRunId,
 * startOffset, endRunId, endOffset }, the same shape markCommands.js's
 * setMarksOverSelection takes) — highlights the range (appending this
 * comment's id to each covered run's `marks.commentIds`, see
 * commentMarks.js) and creates the thread's metadata as one atomic undo
 * step. `authorId` is always caller-supplied — this package has no
 * identity concept of its own (same convention as `History.perform(op, {
 * actorId })`).
 *
 * The highlighted range is local-only in collaboration for v1 (inherits
 * the pre-existing scope of every `replaceRunSpan`-based formatting
 * operation — see EditorStore's REPLACE_RUN_SPAN case); the thread's own
 * metadata (text/author/replies/resolved) IS collaboration-aware and
 * broadcasts live to connected peers.
 *
 * Returns the new comment's id.
 */
export function addComment(store, range, { authorId, text }) {
  const commentId = genId();
  const markOp = addCommentMarkOverRange(store, range, commentId);
  const thread = {
    id: commentId,
    blockId: range.blockId,
    anchorRunIds: [range.startRunId, range.endRunId],
    resolved: false,
    messages: [{ id: genId(), authorId, text, createdAt: Date.now() }],
  };
  const ops = markOp ? [markOp, addCommentThreadOp(thread)] : [addCommentThreadOp(thread)];
  applyOps(store, ops);
  return commentId;
}

/** Appends a reply to an existing thread — one undo step. */
export function replyToComment(store, commentId, { authorId, text }) {
  const message = { id: genId(), authorId, text, createdAt: Date.now() };
  store.applyOperation(addCommentReplyOp(commentId, message));
  return message.id;
}

/** Flips a thread's resolved flag (`resolved` defaults to `true`) — one undo step. */
export function resolveComment(store, commentId, resolved = true) {
  store.applyOperation(resolveCommentOp(commentId, resolved));
}

/** Removes a thread's metadata AND strips its highlight from every run that still carries it — one atomic undo step. */
export function deleteComment(store, commentId) {
  const markRemovalOps = removeCommentMarkEverywhere(store, commentId);
  applyOps(store, [...markRemovalOps, removeCommentThreadOp(commentId)]);
}
