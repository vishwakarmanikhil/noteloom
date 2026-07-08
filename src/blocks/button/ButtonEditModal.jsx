import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../react/Modal.jsx';
import { updateBlockProps, setBlockRuns } from '../../store/operations.js';
import { genId } from '../../utils/idGen.js';
import { XIcon } from '../../react/icons.jsx';

const COLORS = [
  { label: 'Blue', value: '#2b6fd6' },
  { label: 'Green', value: '#2f9e44' },
  { label: 'Red', value: '#e03131' },
  { label: 'Purple', value: '#9c36b5' },
  { label: 'Gray', value: '#495057' },
  { label: 'Black', value: '#1a1a1a' },
];

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * One-stop editor for a button block: label text, link URL, pill color,
 * and an open-ended list of custom key/value attributes (rendered as
 * data-* attributes on the button's own DOM node — see ButtonBlock — so a
 * host app can hook its own CSS/JS onto a button by whatever attribute
 * name it likes, without this package needing to know what for).
 *
 * Renaming the label here replaces the block's runs with a single plain
 * text run (see the save handler) — the inline contentEditable label
 * (click directly into the button's text) is still there and still keeps
 * full rich-text/marks support; this is just a faster, consolidated way to
 * set everything about the button in one place, matching how every other
 * "edit this block's settings" affordance in this package works.
 */
export function ButtonEditModal({ isOpen, onClose, store, blockId }) {
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [color, setColor] = useState(COLORS[0].value);
  const [attrs, setAttrs] = useState([{ key: '', value: '' }]);

  useEffect(() => {
    if (!isOpen) return;
    const block = store.getBlock(blockId);
    if (!block) return;
    const text = block.contentIds.map((runId) => store.getRun(runId)?.value ?? '').join('');
    const existingAttrs = block.props?.customAttrs ?? [];
    setLabel(text);
    setHref(block.props?.href ?? '');
    setColor(block.props?.color ?? COLORS[0].value);
    setAttrs([...existingAttrs, { key: '', value: '' }]);
  }, [isOpen, blockId, store]);

  const updateAttrRow = useCallback((index, patch) => {
    setAttrs((rows) => {
      const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const last = next[next.length - 1];
      if (last.key.trim() || last.value.trim()) next.push({ key: '', value: '' }); // always keep one trailing blank row to add more
      return next;
    });
  }, []);

  const removeAttrRow = useCallback((index) => {
    setAttrs((rows) => rows.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    const newRun = { id: genId(), type: 'text', value: label, marks: {} };
    const customAttrs = attrs.filter((row) => row.key.trim());

    applyOps(store, [
      setBlockRuns(blockId, [newRun]),
      updateBlockProps(blockId, { href: href.trim(), color, customAttrs }),
    ]);
    onClose();
  }, [store, blockId, label, href, color, attrs, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit button">
      <label className="be-modal-field">
        <span>Label</span>
        <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Button" />
      </label>

      <label className="be-modal-field">
        <span>Link URL</span>
        <input
          type="url"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="https://example.com"
        />
      </label>

      <div className="be-modal-field">
        <span>Color</span>
        <div className="be-modal-color-row">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`be-modal-color-swatch${color === c.value ? ' be-modal-color-swatch-active' : ''}`}
              style={{ backgroundColor: c.value }}
              title={c.label}
              aria-label={c.label}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>
      </div>

      <div className="be-modal-field">
        <span>Custom attributes</span>
        {attrs.map((row, index) => (
          <div className="be-modal-attr-row" key={index}>
            <input
              type="text"
              placeholder="name"
              value={row.key}
              onChange={(event) => updateAttrRow(index, { key: event.target.value })}
            />
            <input
              type="text"
              placeholder="value"
              value={row.value}
              onChange={(event) => updateAttrRow(index, { value: event.target.value })}
            />
            {(row.key || row.value) && (
              <button type="button" className="be-modal-attr-remove" onClick={() => removeAttrRow(index)} aria-label="Remove attribute">
                <XIcon size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="be-modal-actions">
        <button type="button" className="be-modal-cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="be-modal-save" onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
}
