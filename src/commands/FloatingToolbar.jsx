import { useEffect, useRef, useState } from 'react';
import { useTextFormattingActions } from './useTextFormattingActions.js';
import { useCoarsePointer } from '../react/useCoarsePointer.js';
import { LinkEditModal } from '../react/LinkEditModal.jsx';
import { CommentComposer } from '../react/CommentComposer.jsx';
import { useAutoAdjustedCenteredLeft } from '../react/usePopoverEdgeClamp.js';
import { BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, LinkIcon, CommentIcon } from '../react/icons.jsx';
import { addCommentMarkOverRange, removeCommentMarkEverywhere } from '../comments/commentMarks.js';
import { addCommentThread } from '../store/operations.js';
import { genId } from '../utils/idGen.js';

const BOOLEAN_BUTTONS = [
  { markName: 'bold', Icon: BoldIcon, title: 'Bold (Ctrl+B)' },
  { markName: 'italic', Icon: ItalicIcon, title: 'Italic (Ctrl+I)' },
  { markName: 'underline', Icon: UnderlineIcon, title: 'Underline (Ctrl+U)' },
  { markName: 'strike', Icon: StrikethroughIcon, title: 'Strikethrough' },
];

const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Red', value: '#e03131' },
  { label: 'Orange', value: '#e8590c' },
  { label: 'Green', value: '#2f9e44' },
  { label: 'Blue', value: '#1971c2' },
  { label: 'Purple', value: '#9c36b5' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: null },
  { label: 'Yellow', value: '#fff3bf' },
  { label: 'Green', value: '#d3f9d8' },
  { label: 'Blue', value: '#d0ebff' },
  { label: 'Pink', value: '#ffdeeb' },
  { label: 'Gray', value: '#e9ecef' },
];

/**
 * A floating format bar that appears above a non-collapsed text
 * selection (see useFloatingToolbarTrigger). Every action goes through
 * useTextFormattingActions (shared with MobileActionBar) — this component
 * only owns the desktop bubble's own chrome/positioning/color-picker state.
 *
 * The whole bar has one onMouseDown that calls preventDefault: the browser's
 * default mousedown action is what collapses the text selection and shifts
 * focus to whatever you clicked — preventing it here (before any button's
 * own onClick even fires) is what lets a toolbar button apply formatting to
 * a selection that's still fully intact, exactly like every other
 * mousedown-then-click floating format toolbar.
 *
 * Deliberately a no-op on a coarse (touch) pointer: a floating bubble
 * positioned off Range.getBoundingClientRect() fights the OS's own native
 * selection-handle UI on mobile, which occupies similar screen space —
 * MobileActionBar (pinned above the keyboard instead) is the touch
 * equivalent, reusing the exact same useTextFormattingActions hook.
 *
 * The Comment button (Notion-style: appears alongside the formatting
 * buttons on any text selection) shows whenever either `onComment` or
 * `commentAuthorId` is given, and is only shown for a same-block selection
 * (`kind === 'same-block'`): commentMarks.js's addCommentMarkOverRange
 * doesn't support a cross-block range yet, matching that module's own
 * single-block scope.
 *
 * If `onComment` is given, clicking it calls `onComment(selection)` and
 * stops there — full host control (open your own modal/popover, decide the
 * author yourself). Otherwise, if `commentAuthorId` is given (see
 * NoteloomEditor's own prop of the same name), clicking it opens a small
 * built-in inline composer — REPLACING the whole button row (not another
 * picker alongside it) so the composer is centered under the selection the
 * exact same way the toolbar itself is, instead of trailing off wherever
 * the Comment button happens to sit in a wide button row. The selected
 * text is highlighted immediately when the composer opens (an `addCommentMarkOverRange`
 * op applied right away, same visible-while-composing behavior Notion/
 * Google Docs have) — Cancel strips that mark back off
 * (`removeCommentMarkEverywhere`), Submit creates the thread using the
 * same id the mark already carries.
 */
export function FloatingToolbar({ isOpen, rect, kind, selection, crossSelection, marks, store, onComment, commentAuthorId }) {
  const isCoarsePointer = useCoarsePointer();
  const [openPicker, setOpenPicker] = useState(null); // 'color' | 'highlight' | 'comment' | null
  const [pendingComment, setPendingComment] = useState(null); // { commentId } | null -- see openCommentComposer
  const rootRef = useRef(null);

  const {
    applyPatch,
    toggleBoolean,
    setSubSuper,
    isLinkModalOpen,
    openLinkModal,
    closeLinkModal,
    handleSaveLink,
    handleRemoveLink,
  } = useTextFormattingActions(store, kind, selection, crossSelection, marks);

  // Mirrors `pendingComment` without being a `useEffect` dependency of its
  // own -- read by the effects below (outside-click/Escape, and the
  // selection-changed reset) so closing the toolbar ANY way while a comment
  // is mid-compose still strips the just-applied highlight, not just the
  // Cancel button's own click handler.
  const pendingCommentRef = useRef(null);
  pendingCommentRef.current = pendingComment;

  function openCommentComposer() {
    if (!selection) return;
    const commentId = genId();
    const markOp = addCommentMarkOverRange(store, selection, commentId);
    if (markOp) store.applyOperation(markOp);
    setPendingComment({ commentId });
    setOpenPicker('comment');
  }

  /** Strips a mid-compose comment's highlight back off (no thread was ever created for it) -- safe to call even when nothing is pending. */
  function discardPendingComment() {
    const pending = pendingCommentRef.current;
    if (!pending) return;
    for (const op of removeCommentMarkEverywhere(store, pending.commentId)) store.applyOperation(op);
    setPendingComment(null);
  }

  function submitCommentComposer(text) {
    if (!pendingComment || !selection) return;
    store.applyOperation(
      addCommentThread({
        id: pendingComment.commentId,
        blockId: selection.blockId,
        anchorRunIds: [selection.startRunId, selection.endRunId],
        resolved: false,
        messages: [{ id: genId(), authorId: commentAuthorId, text, createdAt: Date.now() }],
      }),
    );
    setPendingComment(null);
    setOpenPicker(null);
  }

  function cancelCommentComposer() {
    discardPendingComment();
    setOpenPicker(null);
  }

  useEffect(() => {
    if (!openPicker) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        discardPendingComment();
        setOpenPicker(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        discardPendingComment();
        setOpenPicker(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPicker]);

  // Closing the picker (not the whole toolbar) whenever the selection this
  // toolbar was built for changes out from under it — same rect/kind means
  // the same live selection is still current. Also discards a mid-compose
  // comment's highlight, same reasoning as the outside-click/Escape handlers
  // above (the pending mark shouldn't outlive the composer that would have
  // turned it into a real thread).
  useEffect(() => {
    discardPendingComment();
    setOpenPicker(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, kind]);

  const centerLeft = useAutoAdjustedCenteredLeft(
    rootRef,
    Boolean(isOpen && rect),
    rect ? rect.left + rect.width / 2 : null,
  );

  if (isCoarsePointer) return null;
  if ((!isOpen || !rect) && !isLinkModalOpen) return null;

  const isComposingComment = !onComment && openPicker === 'comment';

  return (
    <>
    {isOpen && rect && centerLeft != null && isComposingComment && (
    // Composing a new comment REPLACES the whole button row (not another
    // picker floating off one of its buttons) -- same outer position as the
    // ordinary toolbar below (centered under the selection), so the
    // composer lands right under the highlighted text instead of trailing
    // off toward wherever the Comment button happened to sit in a wide row.
    <div
      ref={rootRef}
      // Keeping the base `be-floating-toolbar` class (alongside the
      // standalone-specific one below) matters beyond styling --
      // useFloatingToolbarTrigger's recompute() checks
      // `document.activeElement?.closest('.be-floating-toolbar')` to avoid
      // blanking out toolbar state while focus is inside it (e.g. typing
      // into this exact composer); a different class here would silently
      // defeat that guard.
      className="be-floating-toolbar be-floating-toolbar-comment-standalone"
      role="dialog"
      aria-label="Add comment"
      style={{ position: 'fixed', top: rect.top - 44, left: centerLeft, transform: 'translateX(-50%)' }}
      onMouseDown={(event) => {
        if (event.target.tagName !== 'TEXTAREA') event.preventDefault();
      }}
    >
      <CommentComposer authorId={commentAuthorId} autoFocus onSubmit={submitCommentComposer} onCancel={cancelCommentComposer} />
    </div>
    )}
    {isOpen && rect && centerLeft != null && !isComposingComment && (
    <div
      ref={rootRef}
      className="be-floating-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ position: 'fixed', top: rect.top - 44, left: centerLeft, transform: 'translateX(-50%)' }}
      // The comment composer's textarea needs a normal mousedown (to focus/
      // place its own caret on click) -- every other button here is a plain
      // click target with no text input of its own, so preventDefault is
      // still correct for keeping the underlying selection intact when
      // clicking THOSE.
      onMouseDown={(event) => {
        if (event.target.tagName !== 'TEXTAREA') event.preventDefault();
      }}
    >
      {BOOLEAN_BUTTONS.map(({ markName, Icon, title }) => (
        <button
          key={markName}
          type="button"
          className={`be-floating-toolbar-btn${marks[markName] ? ' be-floating-toolbar-btn-active' : ''}`}
          title={title}
          aria-label={title}
          aria-pressed={Boolean(marks[markName])}
          onClick={() => toggleBoolean(markName)}
        >
          <Icon />
        </button>
      ))}

      <button
        type="button"
        className={`be-floating-toolbar-btn${marks.subscript ? ' be-floating-toolbar-btn-active' : ''}`}
        title="Subscript"
        aria-pressed={Boolean(marks.subscript)}
        onClick={() => setSubSuper('subscript')}
      >
        X₂
      </button>
      <button
        type="button"
        className={`be-floating-toolbar-btn${marks.superscript ? ' be-floating-toolbar-btn-active' : ''}`}
        title="Superscript"
        aria-pressed={Boolean(marks.superscript)}
        onClick={() => setSubSuper('superscript')}
      >
        X²
      </button>

      <span className="be-floating-toolbar-divider" />

      <div className="be-floating-toolbar-picker-wrap">
        <button
          type="button"
          className="be-floating-toolbar-btn"
          title="Text color"
          aria-haspopup="true"
          aria-expanded={openPicker === 'color'}
          onClick={() => setOpenPicker((p) => (p === 'color' ? null : 'color'))}
        >
          <span style={{ color: marks.color || 'inherit', fontWeight: 700 }}>A</span>
        </button>
        {openPicker === 'color' && (
          <div className="be-floating-toolbar-picker" role="menu" aria-label="Text color">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                role="menuitem"
                className="be-floating-toolbar-swatch"
                title={c.label}
                onClick={() => {
                  applyPatch({ color: c.value });
                  setOpenPicker(null);
                }}
              >
                <span style={{ color: c.value || '#1a1a1a', fontWeight: 700 }}>A</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="be-floating-toolbar-picker-wrap">
        <button
          type="button"
          className="be-floating-toolbar-btn"
          title="Highlight"
          aria-haspopup="true"
          aria-expanded={openPicker === 'highlight'}
          onClick={() => setOpenPicker((p) => (p === 'highlight' ? null : 'highlight'))}
        >
          <span
            style={{ backgroundColor: marks.highlight || 'transparent', padding: '0 2px', borderRadius: 2 }}
          >
            H
          </span>
        </button>
        {openPicker === 'highlight' && (
          <div className="be-floating-toolbar-picker" role="menu" aria-label="Highlight color">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                role="menuitem"
                className="be-floating-toolbar-swatch"
                style={{ backgroundColor: c.value || 'transparent' }}
                title={c.label}
                onClick={() => {
                  applyPatch({ highlight: c.value });
                  setOpenPicker(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <span className="be-floating-toolbar-divider" />

      <button
        type="button"
        className={`be-floating-toolbar-btn${marks.link ? ' be-floating-toolbar-btn-active' : ''}`}
        title="Link"
        aria-label="Link"
        aria-pressed={Boolean(marks.link)}
        onClick={openLinkModal}
      >
        <LinkIcon />
      </button>

      {(onComment || commentAuthorId) && kind === 'same-block' && (
        <>
          <span className="be-floating-toolbar-divider" />
          <button
            type="button"
            className="be-floating-toolbar-btn"
            title="Comment"
            aria-label="Comment"
            onClick={() => (onComment ? onComment(selection) : openCommentComposer())}
          >
            <CommentIcon />
          </button>
        </>
      )}
    </div>
    )}
    <LinkEditModal
      isOpen={isLinkModalOpen}
      initialHref={marks.link?.href ?? ''}
      initialTarget={marks.link?.target ?? '_self'}
      hasExistingLink={Boolean(marks.link)}
      onSave={handleSaveLink}
      onRemove={handleRemoveLink}
      onClose={closeLinkModal}
    />
    </>
  );
}
