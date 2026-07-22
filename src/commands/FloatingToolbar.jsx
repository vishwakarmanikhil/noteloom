import { useEffect, useRef, useState } from 'react';
import { useTextFormattingActions } from './useTextFormattingActions.js';
import { useCoarsePointer } from '../react/useCoarsePointer.js';
import { LinkEditModal } from '../react/LinkEditModal.jsx';
import { useAutoAdjustedCenteredLeft } from '../react/usePopoverEdgeClamp.js';
import { BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, LinkIcon } from '../react/icons.jsx';

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
 */
export function FloatingToolbar({ isOpen, rect, kind, selection, crossSelection, marks, store }) {
  const isCoarsePointer = useCoarsePointer();
  const [openPicker, setOpenPicker] = useState(null); // 'color' | 'highlight' | null
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

  useEffect(() => {
    if (!openPicker) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpenPicker(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenPicker(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openPicker]);

  // Closing the picker (not the whole toolbar) whenever the selection this
  // toolbar was built for changes out from under it — same rect/kind means
  // the same live selection is still current.
  useEffect(() => {
    setOpenPicker(null);
  }, [rect, kind]);

  const centerLeft = useAutoAdjustedCenteredLeft(
    rootRef,
    Boolean(isOpen && rect),
    rect ? rect.left + rect.width / 2 : null,
  );

  if (isCoarsePointer) return null;
  if ((!isOpen || !rect) && !isLinkModalOpen) return null;

  return (
    <>
    {isOpen && rect && centerLeft != null && (
    <div
      ref={rootRef}
      className="be-floating-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ position: 'fixed', top: rect.top - 44, left: centerLeft, transform: 'translateX(-50%)' }}
      onMouseDown={(event) => event.preventDefault()}
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
