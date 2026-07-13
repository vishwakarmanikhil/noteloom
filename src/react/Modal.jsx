import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Minimal, dependency-free modal dialog: a fixed backdrop + centered panel.
 * Closes on Escape or a click directly on the backdrop (not bubbled up from
 * inside the panel, which is why the backdrop's onMouseDown checks
 * `event.target === event.currentTarget`). No focus trap — the whole
 * editor package is deliberately zero-dependency, and dialogs here are
 * short, single-purpose forms, not deep navigable UI.
 *
 * Does move focus IN (to the first focusable element inside the panel, or
 * the panel itself as a fallback) on open, and OUT (back to whatever had
 * focus right before the modal opened — typically the button that opened
 * it) on close — distinct from a focus trap: it's a one-time move each
 * way, not a loop that prevents Tab from ever leaving the panel.
 */
export function Modal({ isOpen, onClose, title, size = 'default', variant = 'dialog', children }) {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement;
      const panel = panelRef.current;
      const focusable = panel?.querySelector(FOCUSABLE_SELECTOR);
      (focusable ?? panel)?.focus();
      return undefined;
    }
    previouslyFocusedRef.current?.focus?.();
    previouslyFocusedRef.current = null;
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;
  const isSheet = variant === 'sheet';

  return (
    <div
      className={`be-modal-overlay${isSheet ? ' be-modal-overlay-sheet' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`be-modal${size === 'large' ? ' be-modal-large' : ''}${isSheet ? ' be-modal-sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {title && <div className="be-modal-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
