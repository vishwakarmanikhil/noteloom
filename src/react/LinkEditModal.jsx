import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';

/**
 * URL + "open in" form shown for both creating a link (FloatingToolbar's
 * Link button, over a fresh selection) and editing one (LinkHoverCard's
 * pencil icon, over an existing link mark) — one shared modal so both
 * flows look and behave identically, rather than the hover card growing
 * its own smaller inline editor that drifts out of sync with this one.
 */
export function LinkEditModal({ isOpen, initialHref, initialTarget, hasExistingLink, onSave, onRemove, onClose }) {
  const [href, setHref] = useState('');
  const [target, setTarget] = useState('_self');

  useEffect(() => {
    if (!isOpen) return;
    setHref(initialHref);
    setTarget(initialTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const trimmedHref = href.trim();

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (!trimmedHref) return;
      onSave(trimmedHref, target);
    },
    [trimmedHref, target, onSave],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={hasExistingLink ? 'Edit link' : 'Add link'}>
      <form onSubmit={handleSubmit}>
        <label className="be-modal-field">
          <span>URL</span>
          <input
            type="text"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://example.com"
            autoFocus
          />
        </label>
        <label className="be-modal-field">
          <span>Open in</span>
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="_self">Same tab</option>
            <option value="_blank">New tab</option>
          </select>
        </label>
        <div className="be-modal-actions">
          {hasExistingLink && (
            <button type="button" className="be-modal-delete" onClick={onRemove}>
              Remove link
            </button>
          )}
          <button type="button" className="be-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="be-modal-save" disabled={!trimmedHref}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
