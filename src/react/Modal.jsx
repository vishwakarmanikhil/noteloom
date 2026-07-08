import { useEffect } from 'react';

/**
 * Minimal, dependency-free modal dialog: a fixed backdrop + centered panel.
 * Closes on Escape or a click directly on the backdrop (not bubbled up from
 * inside the panel, which is why the backdrop's onMouseDown checks
 * `event.target === event.currentTarget`). No focus trap — the whole
 * editor package is deliberately zero-dependency, and dialogs here are
 * short, single-purpose forms, not deep navigable UI.
 */
export function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="be-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="be-modal" role="dialog" aria-modal="true" aria-label={title}>
        {title && <div className="be-modal-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
