import { useEffect, useState } from 'react';
import { useEditorStore } from '../react/EditorProvider.jsx';
import { resolveMultiRunSelection, resolveCrossBlockSelection } from '../react/selectionResolve.js';
import { getMarksSummaryOverSelection, getMarksSummaryOverBlockRange } from '../inline/markCommands.js';

/**
 * Shows a floating format toolbar whenever the current selection is a real
 * (non-collapsed) text range within `containerRef` — same-block or
 * cross-block, reusing the exact same resolvers useEditorKeyboardShortcuts'
 * Ctrl+B/I already rely on, so "can this selection be formatted at all" is
 * answered identically everywhere in the codebase, not re-derived here.
 *
 * Listens on `document`'s `selectionchange` (selection state can change from
 * a mouseup/keyup that fires outside this exact container, e.g. releasing a
 * drag over another block) rather than a local mouseup/keyup — this mirrors
 * how real editors track selection, and is the only event that reliably
 * fires for every way a selection can change (mouse drag, shift+arrow,
 * double/triple-click, select-all, programmatic).
 *
 * Position is read directly off `Range.getBoundingClientRect()` — a
 * `position: fixed` box anchored to that rect stays correct regardless of
 * page scroll, so this also recomputes on window scroll/resize (capture
 * phase, since an inner scrollable region's scroll event doesn't bubble to
 * window by default).
 */
export function useFloatingToolbarTrigger(containerRef) {
  const store = useEditorStore();
  const [state, setState] = useState(null); // { rect, kind: 'same-block' | 'cross-block', selection/crossSelection, marks }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const recompute = () => {
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setState(null);
        return;
      }
      if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
        setState(null);
        return;
      }

      // jsdom (used by this package's own test suite) implements
      // Element.prototype.getBoundingClientRect but not
      // Range.prototype.getBoundingClientRect at all — falling back to a
      // zero rect keeps this hook's logic testable without a real layout
      // engine, the same way a zero-size rect from a real browser (a
      // genuinely empty range) is already handled fine by callers.
      const rect = selection.getRangeAt(0).getBoundingClientRect?.() ?? { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };

      const sameBlock = resolveMultiRunSelection();
      if (sameBlock) {
        setState({
          kind: 'same-block',
          rect,
          selection: sameBlock,
          marks: getMarksSummaryOverSelection(store, sameBlock.blockId, sameBlock),
        });
        return;
      }

      const crossBlock = resolveCrossBlockSelection(store);
      if (crossBlock) {
        setState({
          kind: 'cross-block',
          rect,
          crossSelection: crossBlock,
          marks: getMarksSummaryOverBlockRange(store, crossBlock),
        });
        return;
      }

      setState(null);
    };

    document.addEventListener('selectionchange', recompute);
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      document.removeEventListener('selectionchange', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [containerRef, store]);

  return {
    isOpen: Boolean(state),
    rect: state?.rect ?? null,
    kind: state?.kind ?? null,
    selection: state?.selection ?? null,
    crossSelection: state?.crossSelection ?? null,
    marks: state?.marks ?? {},
    close: () => setState(null),
  };
}
