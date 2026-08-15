import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useEditorStore } from './EditorProvider.jsx';
import { resolveCollapsedCaret, resolveRunSelection } from './selectionResolve.js';
import { setCaretSync } from './focusRun.js';
import { updateRun } from '../store/operations.js';

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set(Object.values(OPENERS));

/**
 * Optional typing behavior: typing `(`, `[`, or `{` inserts the matching
 * closer and places the caret between them; typing a closer that's already
 * immediately ahead of the caret just moves past it instead of inserting a
 * duplicate; typing an opener while text is selected wraps the selection
 * instead of replacing it. Deliberately excludes quote characters — those
 * are `useSmartQuotes`' job, which substitutes one curly quote per keypress
 * rather than inserting a pair, a genuinely different behavior.
 *
 * Off inside `code` blocks (`type === 'code'`) — literal brackets there are
 * the point, not something to auto-complete around.
 *
 * v1 scope, same limits as the selection resolvers this is built on
 * (`resolveRunSelection`): wraps only a same-run selection; a selection
 * spanning multiple runs/blocks is left to the browser's default insertion
 * (event isn't preventDefault'd). Backspace-deletes-empty-pair isn't
 * implemented — deleting either character of an empty `()` leaves the
 * other one, same as not having this feature.
 */
export function useAutoPairBrackets(containerRef, { enabled = true } = {}) {
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
      const closer = OPENERS[char];

      if (closer) {
        const selection = resolveRunSelection();
        if (selection) {
          if (isCodeBlock(selection.blockId)) return;
          const run = store.getRun(selection.runId);
          if (!run || run.type !== 'text') return;
          event.preventDefault();
          const value = run.value ?? '';
          const nextValue =
            value.slice(0, selection.startOffset) +
            char +
            value.slice(selection.startOffset, selection.endOffset) +
            closer +
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
        const nextValue = value.slice(0, caret.offset) + char + closer + value.slice(caret.offset);
        flushSync(() => store.applyOperation(updateRun(run.id, { value: nextValue })));
        setCaretSync(run.id, caret.offset + 1);
        return;
      }

      if (CLOSERS.has(char)) {
        const caret = resolveCollapsedCaret();
        if (!caret || isCodeBlock(caret.blockId)) return;
        const run = store.getRun(caret.runId);
        if (!run || run.type !== 'text') return;
        const value = run.value ?? '';
        if (value[caret.offset] === char) {
          event.preventDefault();
          setCaretSync(run.id, caret.offset + 1);
        }
      }
    }

    container.addEventListener('beforeinput', handleBeforeInput);
    return () => container.removeEventListener('beforeinput', handleBeforeInput);
  }, [containerRef, store, enabled]);
}
