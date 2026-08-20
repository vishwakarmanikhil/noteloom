import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from './EditorProvider.jsx';
import { findMatches, replaceMatch, replaceAllMatches } from '../search/findInDocument.js';

const RECOMPUTE_DEBOUNCE_MS = 200;

function rangeForMatch(match) {
  const el = document.querySelector(`[data-run-id="${match.runId}"]`);
  const textNode = el?.firstChild;
  if (!textNode || textNode.nodeType !== 3) return null;
  const start = Math.min(match.offset, textNode.length);
  const end = Math.min(match.offset + match.length, textNode.length);
  if (start >= end) return null;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  return range;
}

/**
 * Find (and optionally replace) across the whole document — Ctrl/Cmd+F
 * opens the bar (only while `containerRef` contains focus, so a host page's
 * OWN native find elsewhere on the page is left alone; this is narrower in
 * scope than `usePersistedDocument`'s Ctrl/Cmd+S, which is deliberately
 * page-wide since "save this document" makes sense from anywhere on a page
 * that has one open, whereas "find in THIS editor" doesn't).
 *
 * Matches recompute synchronously on every query/option change (typing in
 * the find field itself), and debounced on document mutations (typing
 * elsewhere while the bar stays open) — same debounce idea as
 * `createAutoPersistence`, just tuned shorter since staleness here is more
 * user-visible than a save being a few hundred ms late.
 *
 * Highlighting uses the CSS Custom Highlight API (`CSS.highlights` +
 * `Highlight`) rather than injecting `<mark>` elements into the DOM — this
 * editor manages its own contentEditable-to-run DOM sync precisely (see
 * `domRunSync.js`), and splicing extra elements into that same tree for
 * highlighting would risk corrupting it. `CSS.highlights` paints purely at
 * the rendering layer, never touching the DOM structure at all. Older
 * Firefox (no Custom Highlight API support) degrades gracefully: search,
 * navigation, and replace all still work — the current/other matches just
 * aren't visually painted.
 */
export function useFindInDocument(containerRef) {
  const store = useEditorStore();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const previouslyFocusedRef = useRef(null);
  const queryInputRef = useRef(null);

  const recompute = useCallback(() => {
    const found = findMatches(store, query, { caseSensitive, wholeWord });
    setMatches(found);
    setCurrentIndex((prev) => (found.length === 0 ? 0 : Math.min(prev, found.length - 1)));
  }, [store, query, caseSensitive, wholeWord]);

  // Synchronous recompute on every query/option change -- these are
  // discrete, deliberate keystrokes/toggles in the find bar itself, not the
  // high-frequency "typing elsewhere in the document" case below.
  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(0);
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, query, caseSensitive, wholeWord]);

  // Debounced recompute when the document itself changes elsewhere (typing,
  // a remote collaborator's edit, undo/redo) while the bar stays open.
  useEffect(() => {
    if (!isOpen) return undefined;
    let timer = null;
    const unsubscribe = store.subscribeAll(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, RECOMPUTE_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [isOpen, store, recompute]);

  // Paints highlights purely via CSS -- see the doc comment above for why
  // this never touches the DOM tree structure itself.
  useEffect(() => {
    if (!isOpen || typeof Highlight === 'undefined' || !CSS.highlights) return undefined;
    const otherRanges = [];
    let currentRange = null;
    matches.forEach((match, index) => {
      const range = rangeForMatch(match);
      if (!range) return;
      if (index === currentIndex) currentRange = range;
      else otherRanges.push(range);
    });
    CSS.highlights.set('be-find-match', new Highlight(...otherRanges));
    if (currentRange) {
      CSS.highlights.set('be-find-current', new Highlight(currentRange));
      const el = document.querySelector(`[data-run-id="${matches[currentIndex]?.runId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      CSS.highlights.delete('be-find-current');
    }
    return () => {
      CSS.highlights.delete('be-find-match');
      CSS.highlights.delete('be-find-current');
    };
  }, [isOpen, matches, currentIndex]);

  const open = useCallback(() => {
    if (isOpen) {
      queryInputRef.current?.select(); // already open: Ctrl+F again refocuses/reselects, matching native find-bar convention
      return;
    }
    previouslyFocusedRef.current = document.activeElement;
    setIsOpen(true);
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsReplaceOpen(false);
    if (typeof Highlight !== 'undefined' && CSS.highlights) {
      CSS.highlights.delete('be-find-match');
      CSS.highlights.delete('be-find-current');
    }
    previouslyFocusedRef.current?.focus?.();
    previouslyFocusedRef.current = null;
  }, []);

  useEffect(() => {
    if (isOpen) queryInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handleKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        open();
      }
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, open]);

  const next = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const replaceCurrent = useCallback(() => {
    const match = matches[currentIndex];
    if (!match) return;
    replaceMatch(store, match, replacement);
    // recompute happens via the subscribeAll debounce above; matches[currentIndex]
    // itself is now stale (this run's text just changed), so the effect's own
    // clamp-to-length logic picks a sane next current match.
  }, [store, matches, currentIndex, replacement]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;
    replaceAllMatches(store, matches, replacement);
  }, [store, matches, replacement]);

  return {
    isOpen,
    open,
    close,
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    isReplaceOpen,
    setIsReplaceOpen,
    replacement,
    setReplacement,
    matches,
    currentIndex,
    next,
    prev,
    replaceCurrent,
    replaceAll,
    queryInputRef,
  };
}
