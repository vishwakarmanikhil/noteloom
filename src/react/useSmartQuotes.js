import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useEditorStore } from './EditorProvider.jsx';
import { resolveCollapsedCaret, resolveRunSelection } from './selectionResolve.js';
import { setCaretSync } from './focusRun.js';
import { updateRun } from '../store/operations.js';

const CURLY = {
  '"': { open: '“', close: '”' },
  "'": { open: '‘', close: '’' },
};

// Whitespace, start-of-line, or opening punctuation before the caret means the next quote is opening; anything else (most often a letter, as in an apostrophe) means closing.
function pickQuote(char, precedingChar) {
  const pair = CURLY[char];
  if (precedingChar === undefined || /[\s([{“‘]/.test(precedingChar)) return pair.open;
  return pair.close;
}

/**
 * Optional typing behavior: a straight `"`/`'` typed while composing text is
 * replaced with the contextually correct curly quote — one character in,
 * one character out, not a pair (that distinguishes this from
 * `useAutoPairBrackets`, which does insert pairs, deliberately for a
 * different set of characters). Typing a quote while text is selected wraps
 * the selection in an open+close pair instead — the one place this hook
 * does insert two characters, matching how quoting a selection behaves in
 * most rich text editors.
 *
 * Off inside `code` blocks — string literals need literal quote characters.
 */
export function useSmartQuotes(containerRef, { enabled = true } = {}) {
  const store = useEditorStore();

  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    function isCodeBlock(blockId) {
      return store.getBlock(blockId)?.type === 'code';
    }

    function handleBeforeInput(event) {
      if (event.inputType !== 'insertText' || !event.data || event.data.length !== 1) return;
      const char = event.data;
      const pair = CURLY[char];
      if (!pair) return;

      const selection = resolveRunSelection();
      if (selection) {
        if (isCodeBlock(selection.blockId)) return;
        const run = store.getRun(selection.runId);
        if (!run || run.type !== 'text') return;
        event.preventDefault();
        const value = run.value ?? '';
        const nextValue =
          value.slice(0, selection.startOffset) +
          pair.open +
          value.slice(selection.startOffset, selection.endOffset) +
          pair.close +
          value.slice(selection.endOffset);
        flushSync(() => store.applyOperation(updateRun(run.id, { value: nextValue })));
        setCaretSync(run.id, selection.endOffset + 2);
        return;
      }

      const caret = resolveCollapsedCaret();
      if (!caret || isCodeBlock(caret.blockId)) return;
      const run = store.getRun(caret.runId);
      if (!run || run.type !== 'text') return;
      event.preventDefault();
      const value = run.value ?? '';
      const quote = pickQuote(char, value[caret.offset - 1]);
      const nextValue = value.slice(0, caret.offset) + quote + value.slice(caret.offset);
      flushSync(() => store.applyOperation(updateRun(run.id, { value: nextValue })));
      setCaretSync(run.id, caret.offset + 1);
    }

    container.addEventListener('beforeinput', handleBeforeInput);
    return () => container.removeEventListener('beforeinput', handleBeforeInput);
  }, [containerRef, store, enabled]);
}
