import { useCallback, useRef, useState } from 'react';
import {
  toggleMarkOverSelection,
  toggleMarkOverBlockRange,
  setMarksOverSelection,
  setMarksOverBlockRange,
} from '../inline/markCommands.js';
import { focusRunEnd } from '../react/focusRun.js';

/**
 * The mark-toggling/link-editing logic behind the text-formatting UI —
 * shared by FloatingToolbar (desktop, appears as a bubble above a mouse
 * selection) and MobileActionBar (touch, appears pinned above the on-screen
 * keyboard instead, since a floating bubble fights the OS's own native
 * selection-handle UI there). Both are just different chrome around the
 * exact same setMarksOverSelection/setMarksOverBlockRange/
 * toggleMarkOverSelection/toggleMarkOverBlockRange primitives the keyboard
 * shortcuts already use — extracting this once means there's only one place
 * that ever calls those, not two copies that could drift apart.
 *
 * `kind`/`selection`/`crossSelection` are whatever useFloatingToolbarTrigger
 * already resolves ('same-block' vs 'cross-block' plus the matching
 * selection shape) — this hook doesn't re-resolve anything itself, so it
 * works identically whether the caller is reacting to a live mouse
 * selection or a snapshot captured earlier (e.g. right before a modal steals
 * focus — see openLinkModal's pendingLinkRef below).
 */
export function useTextFormattingActions(store, kind, selection, crossSelection, marks) {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const applyPatch = useCallback(
    (marksPatch) => {
      const newRunId =
        kind === 'same-block'
          ? setMarksOverSelection(store, selection.blockId, selection, marksPatch)
          : setMarksOverBlockRange(store, crossSelection, marksPatch);
      if (newRunId) focusRunEnd(newRunId);
      return newRunId;
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
  // focusing the link modal's URL input moves focus out of the
  // contentEditable region, which can collapse/change the document
  // selection this hook was built for (kind/selection/crossSelection would
  // otherwise go stale, or the caller's own bar would unmount out from
  // under the still-open modal).
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

  return {
    applyPatch,
    toggleBoolean,
    setSubSuper,
    isLinkModalOpen,
    openLinkModal,
    closeLinkModal,
    handleSaveLink,
    handleRemoveLink,
  };
}
