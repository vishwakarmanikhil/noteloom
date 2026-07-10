import { useCallback, useEffect, useRef, useState } from 'react';
import {
  toggleMarkOverSelection,
  toggleMarkOverBlockRange,
  setMarksOverSelection,
  setMarksOverBlockRange,
} from '../inline/markCommands.js';
import { focusRunEnd } from '../react/focusRun.js';
import { LinkEditModal } from '../react/LinkEditModal.jsx';
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
 * Notion/TipTap-style format bar that appears above a non-collapsed text
 * selection (see useFloatingToolbarTrigger). Every action goes through the
 * same setMarksOverSelection/setMarksOverBlockRange primitives the keyboard
 * shortcuts use — this is just another caller, not a parallel code path —
 * so copy/cut/paste/undo/serialization all already work correctly for
 * anything applied here, with zero extra wiring.
 *
 * The whole bar has one onMouseDown that calls preventDefault: the browser's
 * default mousedown action is what collapses the text selection and shifts
 * focus to whatever you clicked — preventing it here (before any button's
 * own onClick even fires) is what lets a toolbar button apply formatting to
 * a selection that's still fully intact, exactly like every other
 * mousedown-then-click toolbar (Google Docs, Notion, etc.).
 */
export function FloatingToolbar({ isOpen, rect, kind, selection, crossSelection, marks, store }) {
  const [openPicker, setOpenPicker] = useState(null); // 'color' | 'highlight' | null
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const rootRef = useRef(null);

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

  const applyPatch = useCallback(
    (marksPatch) => {
      const newRunId =
        kind === 'same-block'
          ? setMarksOverSelection(store, selection.blockId, selection, marksPatch)
          : setMarksOverBlockRange(store, crossSelection, marksPatch);
      if (newRunId) focusRunEnd(newRunId);
      setOpenPicker(null);
    },
    [store, kind, selection, crossSelection],
  );

  const toggleBoolean = useCallback(
    (markName) => {
      const newRunId =
        kind === 'same-block'
          ? toggleMarkOverSelection(store, selection.blockId, selection, markName)
          : toggleMarkOverBlockRange(store, crossSelection, markName);
      if (newRunId) focusRunEnd(newRunId);
    },
    [store, kind, selection, crossSelection],
  );

  // Subscript/superscript are mutually exclusive — enabling one always
  // clears the other in the SAME patch (one pass over the run span), not
  // two sequential calls, which would risk the second call addressing runs
  // by an id the first call's split already made stale (see
  // applyMarksPatchOverRunSpan's doc comment in markCommands.js).
  const setSubSuper = useCallback(
    (markName) => {
      const opposite = markName === 'subscript' ? 'superscript' : 'subscript';
      const enable = !marks[markName];
      applyPatch({ [markName]: enable ? true : null, [opposite]: null });
    },
    [marks, applyPatch],
  );

  // Captured at the moment "Link" is clicked, not read live from props —
  // focusing the modal's URL input moves focus out of the contentEditable
  // region, which can collapse/change the document selection the toolbar
  // was built for (isOpen/rect/marks would otherwise go stale or the whole
  // bar would unmount out from under the open modal).
  const pendingLinkRef = useRef(null);

  const openLinkModal = useCallback(() => {
    pendingLinkRef.current = { kind, selection, crossSelection };
    setIsLinkModalOpen(true);
  }, [kind, selection, crossSelection]);

  const closeLinkModal = useCallback(() => setIsLinkModalOpen(false), []);

  const applyLinkPatch = useCallback(
    (marksPatch) => {
      const pending = pendingLinkRef.current;
      if (!pending) return;
      const newRunId =
        pending.kind === 'same-block'
          ? setMarksOverSelection(store, pending.selection.blockId, pending.selection, marksPatch)
          : setMarksOverBlockRange(store, pending.crossSelection, marksPatch);
      if (newRunId) focusRunEnd(newRunId);
      setIsLinkModalOpen(false);
    },
    [store],
  );

  const handleSaveLink = useCallback((href, target) => applyLinkPatch({ link: { href, target } }), [applyLinkPatch]);
  const handleRemoveLink = useCallback(() => applyLinkPatch({ link: null }), [applyLinkPatch]);

  if ((!isOpen || !rect) && !isLinkModalOpen) return null;

  return (
    <>
    {isOpen && rect && (
    <div
      ref={rootRef}
      className="be-floating-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ position: 'fixed', top: rect.top - 44, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }}
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
                onClick={() => applyPatch({ color: c.value })}
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
                onClick={() => applyPatch({ highlight: c.value })}
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

