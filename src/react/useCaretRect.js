import { useEffect, useState } from 'react';

/**
 * Tracks the live collapsed caret's bounding rect, recomputed via the same
 * event set `useFloatingToolbarTrigger` uses for its own (non-collapsed)
 * selection tracking — `document`'s `selectionchange`, plus `window`
 * scroll (capture phase)/resize, since a `position: fixed` box anchored to
 * a rect needs to stay correct across page scroll. `selectionchange` fires
 * even for *programmatic* `Selection.addRange()` calls, which is what
 * `setCaretSync` (focusRun.js) already does on every voice-dictation text
 * insertion — so this reliably follows the caret while dictating without
 * useVoiceTyping needing to know anything about this hook at all.
 *
 * Only active while `isActive` is true (pass `voice.isListening`) — a
 * no-op with zero listeners attached otherwise, so this costs nothing when
 * not dictating. Returns `null` whenever there's no collapsed caret inside
 * an editable run (`[data-run-id]`), rather than a stale/wrong position.
 */
export function useCaretRect(isActive) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!isActive) {
      setRect(null);
      return undefined;
    }

    const recompute = () => {
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
        setRect(null);
        return;
      }
      const node = selection.anchorNode;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (!el?.closest?.('[data-run-id]')) {
        setRect(null);
        return;
      }

      // jsdom (this package's own test suite) implements
      // Element.prototype.getBoundingClientRect but not
      // Range.prototype.getBoundingClientRect — falling back to a zero
      // rect keeps this testable without a real layout engine, same
      // convention as useFloatingToolbarTrigger.
      const nextRect = selection.getRangeAt(0).getBoundingClientRect?.() ?? {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      };
      setRect(nextRect);
    };

    recompute();
    document.addEventListener('selectionchange', recompute);
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      document.removeEventListener('selectionchange', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [isActive]);

  return rect;
}
