import { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../react/EditorProvider.jsx';
import { stripEmptyRunPlaceholder } from '../react/domRunSync.js';

function matchesQuery(command, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return command.label.toLowerCase().includes(q) || command.keywords?.some((k) => k.toLowerCase().includes(q));
}

/**
 * Resolves the caret's logical offset within `runEl`'s text (with the
 * empty-run placeholder stripped), regardless of whether the browser's
 * selection anchors on the run's text node directly or on the run element
 * itself (e.g. a not-yet-populated node). Falls back to "end of text" if
 * the selection isn't actually inside this element.
 */
function caretOffsetInRun(runEl, selection) {
  const node = selection.anchorNode;
  const rawOffset = selection.anchorOffset;
  let rawTextBeforeCaret;

  if (node === runEl) {
    rawTextBeforeCaret = '';
    for (let i = 0; i < rawOffset && i < runEl.childNodes.length; i += 1) {
      rawTextBeforeCaret += runEl.childNodes[i].textContent ?? '';
    }
  } else if (node && node.parentElement === runEl) {
    rawTextBeforeCaret = (node.textContent ?? '').slice(0, rawOffset);
  } else {
    rawTextBeforeCaret = runEl.textContent ?? '';
  }

  return stripEmptyRunPlaceholder(rawTextBeforeCaret).length;
}

/**
 * Shared machinery behind both useSlashMenuTrigger ("/") and
 * useEmojiMenuTrigger (":") — watches for `regex` matching the text up to
 * the caret within any run inside `containerRef`, and resolves the matching
 * commands via `getCommands()`. Each caller only differs in its trigger
 * regex and its command source; the caret-resolution/query-matching/
 * keyboard-dismiss logic (this file) is identical either way.
 *
 * `regex` must have exactly two capture groups: group 1 is whatever
 * precedes the trigger character (start-of-string or whitespace, so it
 * isn't consumed as part of the query), group 2 is the query typed after
 * the trigger character.
 */
export function useTriggerMenu(containerRef, regex, getCommands) {
  const store = useEditorStore();
  const [state, setState] = useState(null); // { query, blockId, runId, sliceStart, sliceEnd, rect }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleInput = () => {
      const selection = window.getSelection?.();
      const anchorNode = selection?.anchorNode;
      let el = anchorNode?.nodeType === 1 ? anchorNode : anchorNode?.parentElement;
      while (el && typeof el.hasAttribute === 'function' && !el.hasAttribute('data-run-id')) {
        el = el.parentElement;
      }
      const runId = el?.getAttribute?.('data-run-id');
      if (!runId || !selection) {
        setState(null);
        return;
      }

      const caretOffset = caretOffsetInRun(el, selection);
      const textBeforeCaret = stripEmptyRunPlaceholder(el.textContent).slice(0, caretOffset);
      const match = regex.exec(textBeforeCaret);
      if (!match) {
        setState(null);
        return;
      }

      const blockId = el.closest?.('[data-block-id]')?.getAttribute('data-block-id');
      if (!blockId) {
        setState(null);
        return;
      }
      const sliceStart = match.index + match[1].length; // position of the trigger character itself
      setState({ query: match[2], blockId, runId, sliceStart, sliceEnd: caretOffset, rect: el.getBoundingClientRect() });
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setState(null);
    };

    container.addEventListener('input', handleInput);
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('input', handleInput);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, regex]);

  const commands = state ? getCommands().filter((cmd) => matchesQuery(cmd, state.query)) : [];

  const selectCommand = useCallback(
    (command) => {
      if (!state) return;
      // Deliberately does NOT trim the query text here: a block command
      // just wants it gone (trimSlashQueryAndInsertAfter handles that), but
      // an inline command needs the untouched sliceStart/sliceEnd to splice
      // its chip/text in at the exact cursor position — pre-merging before/
      // after text here would destroy that split point.
      command.run(store, {
        blockId: state.blockId,
        runId: state.runId,
        sliceStart: state.sliceStart,
        sliceEnd: state.sliceEnd,
      });
      setState(null);
    },
    [state, store],
  );

  const close = useCallback(() => setState(null), []);

  return {
    isOpen: Boolean(state),
    query: state?.query ?? '',
    rect: state?.rect ?? null,
    runId: state?.runId ?? null,
    commands,
    selectCommand,
    close,
  };
}
