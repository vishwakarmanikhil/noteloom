import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateRun } from '../store/operations.js';
import { LinkEditModal } from './LinkEditModal.jsx';
import { useAutoAdjustedPosition } from './useAutoAdjustedPosition.js';
import { PencilIcon, XIcon } from './icons.jsx';

/**
 * Hover card for editing/removing an existing link mark — the counterpart
 * to FloatingToolbar's Link button (which only handles *creating* a link
 * over a selection). A plain click on link text just places the caret (see
 * EditableBlockContent's marksToStyle/onclick comment — navigation is
 * Ctrl/Cmd+click only, since the text is still editable), so there needs
 * to be some other way to discover "this is a link" and get back into it
 * without re-selecting the exact same text again. Hovering is that
 * discovery path, the same link-tooltip pattern most rich text editors use.
 *
 * The pencil button opens the exact same LinkEditModal FloatingToolbar's
 * Link button uses (pre-filled), rather than a second, smaller inline
 * editor — one link-editing UI, not two that could drift apart.
 *
 * Mutates the run directly via updateRun(runId, {marks}) rather than going
 * through the selection-based markCommands primitives — there's no live
 * text selection here at all, just "this one run, whichever block it's
 * in", so addressing it by run id directly is both simpler and correct
 * (no need to resolve/reconstruct a blockId+selection just to describe
 * "the whole of this one run").
 */
export function LinkHoverCard({ containerRef, store }) {
  const [hovered, setHovered] = useState(null); // { runId, rect } | null
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const cardRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      // A modal-open edit shouldn't vanish just because the mouse left the
      // hover card that launched it — only actually dismiss the underlying
      // hover state once the modal itself is closed (see the Save/Cancel
      // handlers below, which clear `hovered` themselves).
      setHovered((prev) => (isModalOpen ? prev : null));
    }, 250);
  }, [clearHideTimer, isModalOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleMouseOver = (event) => {
      const runEl = event.target.closest?.('[data-run-id]');
      if (!runEl || !container.contains(runEl)) return;
      const runId = runEl.dataset.runId;
      const run = store.getRun(runId);
      if (!run?.marks?.link) return;
      clearHideTimer();
      setHovered((prev) => (prev?.runId === runId ? prev : { runId, rect: runEl.getBoundingClientRect() }));
    };
    const handleMouseOut = () => scheduleHide();

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
    };
  }, [containerRef, store, clearHideTimer, scheduleHide]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setHovered(null);
  }, []);

  const saveLink = useCallback(
    (href, target) => {
      if (!hovered) return;
      const run = store.getRun(hovered.runId);
      if (!run) return;
      store.applyOperation(updateRun(hovered.runId, { marks: { ...run.marks, link: { href, target } } }));
      closeModal();
    },
    [hovered, store, closeModal],
  );

  const removeLink = useCallback(() => {
    if (!hovered) return;
    const run = store.getRun(hovered.runId);
    if (!run) return;
    const nextMarks = { ...run.marks };
    delete nextMarks.link;
    store.applyOperation(updateRun(hovered.runId, { marks: nextMarks }));
    closeModal();
  }, [hovered, store, closeModal]);

  const run = hovered && store.getRun(hovered.runId);
  const link = run?.marks?.link;
  const isCardOpen = Boolean(hovered && link && !isModalOpen);
  const position = useAutoAdjustedPosition(
    cardRef,
    isCardOpen,
    hovered ? hovered.rect.bottom + 6 : null,
    hovered ? hovered.rect.left : null,
  );

  return (
    <>
      {isCardOpen && position
        ? createPortal(
            <div
              ref={cardRef}
              className="be-link-hover-card"
              contentEditable={false}
              style={{ position: 'fixed', top: position.top, left: position.left }}
              onMouseEnter={clearHideTimer}
              onMouseLeave={scheduleHide}
            >
              <a
                className="be-link-hover-card-url"
                href={link.href}
                target={link.target === '_blank' ? '_blank' : '_self'}
                rel="noopener noreferrer"
              >
                {link.href}
              </a>
              <button type="button" className="be-link-hover-card-btn" onClick={openModal} aria-label="Edit link" title="Edit link">
                <PencilIcon size={13} />
              </button>
              <button
                type="button"
                className="be-link-hover-card-btn"
                onClick={removeLink}
                aria-label="Remove link"
                title="Remove link"
              >
                <XIcon size={13} />
              </button>
            </div>,
            document.body,
          )
        : null}
      <LinkEditModal
        isOpen={isModalOpen}
        initialHref={link?.href ?? ''}
        initialTarget={link?.target ?? '_self'}
        hasExistingLink={Boolean(link)}
        onSave={saveLink}
        onRemove={removeLink}
        onClose={closeModal}
      />
    </>
  );
}
