import { useCallback } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { Select } from '../../react/Select.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useBlockClassName } from '../../react/EditorProvider.jsx';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusRunEnd, focusRunAtOffset } from '../../react/focusRun.js';
import { resolveCollapsedCaret } from '../../react/selectionResolve.js';
import { updateRun, updateBlockProps } from '../../store/operations.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { deleteBlockAndFocusSibling } from '../shared/blockActions.js';
import { TrashIcon } from '../../react/icons.jsx';

export const LANGUAGES = ['plaintext', 'javascript', 'python', 'html', 'css', 'json', 'bash', 'sql'];
const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({ value: lang, label: lang }));

/**
 * Inserts literal text at the live caret within `blockId`'s own run,
 * splicing directly into that run's value — used for Enter (a real "\n",
 * not a block split: a code block is multi-line *within one block*, like a
 * <textarea>, matching Notion/TipTap) and Tab (two literal spaces, since
 * Tab inside code should never trigger indent-list/next-cell navigation).
 * Deliberately simple (single-run splice, no split-into-marks handling)
 * because code content is plain text — no rich inline formatting is
 * offered for it in this UI.
 */
function insertLiteralTextAtCaret(store, blockId, text) {
  const caret = resolveCollapsedCaret();
  if (!caret || caret.blockId !== blockId) return;
  const run = store.getRun(caret.runId);
  if (!run || run.type !== 'text') return;
  const value = run.value ?? '';
  const newValue = value.slice(0, caret.offset) + text + value.slice(caret.offset);
  store.applyOperation(updateRun(run.id, { value: newValue }));
  focusRunAtOffset(run.id, caret.offset + text.length);
}

/**
 * A leaf block (own runs, same mechanism as paragraph/heading) rendered
 * inside a <pre><code> so embedded "\n" characters actually break lines
 * (white-space: pre-wrap, see the CSS) — the only block type where Enter
 * doesn't split into a new sibling. Backspace-at-start still goes through
 * the ordinary shared mergeWithPreviousOrDelete: code is deliberately NOT
 * in MERGEABLE_TEXT_TYPES (concatenating code text into a plain paragraph,
 * or vice versa, has no sensible meaning — same exclusion as table/
 * listItem), so a *non-empty* code block simply won't merge into its
 * previous sibling; an *empty* one is still removed outright, landing
 * focus on whatever came before it.
 *
 * No syntax highlighting (tokenizing/coloring code) is performed — that
 * needs a highlighter library, which the zero-runtime-dependency
 * constraint on this package rules out. `props.language` is kept as plain
 * metadata (round-trips through copy/paste and serialization) for a host
 * app to feed into its own highlighter if it has one.
 */
export function CodeBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);

  const handleEnter = useCallback(() => insertLiteralTextAtCaret(store, id, '\n'), [store, id]);
  const handleTab = useCallback(() => insertLiteralTextAtCaret(store, id, '  '), [store, id]);

  const handleBackspaceAtStart = useCallback(() => {
    const focusBlockId = mergeWithPreviousOrDelete(store, id);
    if (!focusBlockId || focusBlockId === id) return;
    const focusBlock = store.getBlock(focusBlockId);
    const lastRunId = focusBlock?.contentIds?.[focusBlock.contentIds.length - 1];
    if (lastRunId) focusRunEnd(lastRunId);
  }, [store, id]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const handleLanguageChange = useCallback(
    (language) => store.applyOperation(updateBlockProps(id, { language })),
    [store, id],
  );

  const handleDelete = useCallback(() => deleteBlockAndFocusSibling(store, id), [store, id]);

  const className = useBlockClassName('be-code-block', block);

  if (!block) return null;
  const language = block.props?.language ?? 'plaintext';
  const isEmpty = isRunsEmpty(store, block.contentIds);

  return (
    <div className={className} data-block-id={id}>
      <div className="be-code-block-header" contentEditable={false}>
        <Select
          className="be-code-block-language"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={handleLanguageChange}
          ariaLabel="Code language"
        />
        <button type="button" className="be-code-block-delete" onClick={handleDelete} aria-label="Delete code block" title="Delete code block">
          <TrashIcon size={14} />
        </button>
      </div>
      {/*
        Deliberately always dir="ltr", never resolveBlockDir — code syntax
        (brackets, operators, punctuation) is structurally LTR regardless of
        what language a comment/string literal happens to be written in;
        letting it inherit an RTL document default would scramble the
        visual order of the code itself, not just the prose inside it. Every
        real code editor (VS Code included) forces LTR for code for the
        same reason.
      */}
      <pre className="be-code-block-pre" dir="ltr">
        <code data-empty={isEmpty ? '' : undefined} data-placeholder="Empty code block">
          <EditableBlockContent
            blockId={id}
            runIds={block.contentIds}
            dir="ltr"
            onEnter={handleEnter}
            onTab={handleTab}
            onBackspaceAtStart={handleBackspaceAtStart}
            onArrowUp={handleArrowUp}
            onArrowDown={handleArrowDown}
          />
        </code>
      </pre>
    </div>
  );
}
