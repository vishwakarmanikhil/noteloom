// Optional typing-behavior extensions, expressed with defineExtension()'s
// `onBeforeInput` hook. Framework-free — they mutate through `ctx` (whose
// applyOperation already wraps flushSync so the DOM is in sync before
// setCaret). These are the same behaviors as the older `useSmartQuotes` /
// `useAutoPairBrackets` hooks, repackaged so they drop into
// `useEditor({ extensions: [smartQuotes()] })` alongside blocks and chips.

import { defineExtension } from '../registry/define.js';
import { updateRun } from '../store/operations.js';

const CURLY = {
  '"': { open: '“', close: '”' },
  "'": { open: '‘', close: '’' },
};

// Whitespace, start-of-line, or an opening bracket/quote before the caret ->
// the next quote is an opening one; anything else (usually a letter, as in an
// apostrophe) -> a closing one.
function pickQuote(char, precedingChar) {
  const pair = CURLY[char];
  if (precedingChar === undefined || /[\s([{“‘]/.test(precedingChar)) return pair.open;
  return pair.close;
}

function singleInsertChar(event) {
  if (event.inputType !== 'insertText' || !event.data || event.data.length !== 1) return null;
  return event.data;
}

function isType(ctx, blockId, type) {
  return ctx.getBlock(blockId)?.type === type;
}

/**
 * Straight `"` / `'` typed while composing becomes the contextually correct
 * curly quote (one char in, one out). Typing one with text selected wraps the
 * selection in an open+close pair. Off inside `code` blocks.
 */
export function smartQuotes() {
  return defineExtension({
    name: 'smart-quotes',
    onBeforeInput(ctx, event) {
      const char = singleInsertChar(event);
      if (!char || !CURLY[char]) return false;
      const pair = CURLY[char];

      const selection = ctx.getSelection();
      if (selection) {
        if (isType(ctx, selection.blockId, 'code')) return false;
        const run = ctx.getRun(selection.runId);
        if (!run || run.type !== 'text') return false;
        const value = run.value ?? '';
        const next =
          value.slice(0, selection.startOffset) +
          pair.open +
          value.slice(selection.startOffset, selection.endOffset) +
          pair.close +
          value.slice(selection.endOffset);
        ctx.applyOperation(updateRun(run.id, { value: next }));
        ctx.setCaret(run.id, selection.endOffset + 2);
        return true;
      }

      const caret = ctx.getCaret();
      if (!caret || isType(ctx, caret.blockId, 'code')) return false;
      const run = ctx.getRun(caret.runId);
      if (!run || run.type !== 'text') return false;
      const value = run.value ?? '';
      const quote = pickQuote(char, value[caret.offset - 1]);
      ctx.applyOperation(
        updateRun(run.id, {
          value: value.slice(0, caret.offset) + quote + value.slice(caret.offset),
        }),
      );
      ctx.setCaret(run.id, caret.offset + 1);
      return true;
    },
  });
}

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set(Object.values(OPENERS));

/**
 * Typing `(` `[` `{` inserts the matching closer and puts the caret between
 * them; typing a closer already sitting ahead of the caret just steps past it;
 * typing an opener with text selected wraps the selection. Off inside `code`
 * blocks. Excludes quotes — that's `smartQuotes()`.
 */
export function autoPairBrackets() {
  return defineExtension({
    name: 'auto-pair-brackets',
    onBeforeInput(ctx, event) {
      const char = singleInsertChar(event);
      if (!char) return false;
      const closer = OPENERS[char];

      if (closer) {
        const selection = ctx.getSelection();
        if (selection) {
          if (isType(ctx, selection.blockId, 'code')) return false;
          const run = ctx.getRun(selection.runId);
          if (!run || run.type !== 'text') return false;
          const value = run.value ?? '';
          const next =
            value.slice(0, selection.startOffset) +
            char +
            value.slice(selection.startOffset, selection.endOffset) +
            closer +
            value.slice(selection.endOffset);
          ctx.applyOperation(updateRun(run.id, { value: next }));
          ctx.setCaret(run.id, selection.endOffset + 2);
          return true;
        }

        const caret = ctx.getCaret();
        if (!caret || isType(ctx, caret.blockId, 'code')) return false;
        const run = ctx.getRun(caret.runId);
        if (!run || run.type !== 'text') return false;
        const value = run.value ?? '';
        ctx.applyOperation(
          updateRun(run.id, {
            value: value.slice(0, caret.offset) + char + closer + value.slice(caret.offset),
          }),
        );
        ctx.setCaret(run.id, caret.offset + 1);
        return true;
      }

      if (CLOSERS.has(char)) {
        const caret = ctx.getCaret();
        if (!caret || isType(ctx, caret.blockId, 'code')) return false;
        const run = ctx.getRun(caret.runId);
        if (!run || run.type !== 'text') return false;
        if ((run.value ?? '')[caret.offset] === char) {
          ctx.setCaret(run.id, caret.offset + 1);
          return true;
        }
      }
      return false;
    },
  });
}
