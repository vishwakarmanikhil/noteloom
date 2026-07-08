import { useCallback, useEffect, useState } from 'react';
import { useEditorStore, useBlockRegistry, useInlineRegistry } from '../react/EditorProvider.jsx';
import { stripEmptyRunPlaceholder } from '../react/domRunSync.js';

// Matches a "/" at the very start of the text, or right after whitespace,
// followed by any word characters, anchored to the END of the string passed
// in — the caller passes only the text *up to the caret*, which is what
// lets "/" work with content after the cursor too ("hello /table| world"),
// not just when the caret happens to be at the very end of the run.
const SLASH_RE = /(^|\s)\/(\w*)$/;

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
 * Watches for "/" typed anywhere inside a run within `containerRef` and
 * tracks the query typed after it — works mid-block, with other text both
 * before and after the trigger in the same run, not just when the caret is
 * at the very end of otherwise-empty content. Commands come from both the
 * block registry (insert a new block after the current one) and the
 * inline-type registry (splice an atomic element in at the cursor) — see
 * each type's own `run(store, {blockId, runId})`. Only the matched
 * "/query" substring is removed on selection (preserving whatever comes
 * before *and after* it in the run), not the whole run.
 *
 * Resolves the run from the *caret position* (window.getSelection), not
 * `event.target` — for a native `input` event fired on a contentEditable
 * region, target is always the contentEditable host element itself (the
 * block's shared EditableBlockContent wrapper), never the specific
 * `[data-run-id]` child span the browser actually mutated.
 */
export function useSlashMenuTrigger(containerRef) {
  const store = useEditorStore();
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();
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
      const match = SLASH_RE.exec(textBeforeCaret);
      if (!match) {
        setState(null);
        return;
      }

      const blockId = el.closest?.('[data-block-id]')?.getAttribute('data-block-id');
      if (!blockId) {
        setState(null);
        return;
      }
      const sliceStart = match.index + match[1].length; // position of the "/" itself
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
  }, [containerRef]);

  const commands = state
    ? [...registry.listSlashCommands(), ...(inlineRegistry?.listSlashCommands() ?? [])].filter((cmd) =>
        matchesQuery(cmd, state.query),
      )
    : [];

  const selectCommand = useCallback(
    (command) => {
      if (!state) return;
      // Deliberately does NOT trim the "/query" text here: a block command
      // just wants it gone (trimSlashQueryAndInsertAfter handles that), but
      // an inline command needs the untouched sliceStart/sliceEnd to splice
      // its chip in at the exact cursor position — pre-merging before/after
      // text here would destroy that split point and the chip would always
      // land at the end of whatever was left, regardless of where "/" was
      // actually typed.
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
