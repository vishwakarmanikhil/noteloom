import { useCallback, useSyncExternalStore } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { Select } from '../../react/Select.jsx';
import { useBlock } from '../../react/useBlock.js';
import {
  useEditorStore,
  useBlockClassName,
  useShowLineNumbers,
  useHighlightCode,
} from '../../react/EditorProvider.jsx';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusRunEnd, focusRunAtOffset } from '../../react/focusRun.js';
import { resolveCollapsedCaret } from '../../react/selectionResolve.js';
import { updateRun, updateBlockProps } from '../../store/operations.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { deleteBlockAndFocusSibling } from '../shared/blockActions.js';
import { TrashIcon } from '../../react/icons.jsx';

export const LANGUAGES = [
  'plaintext',
  'javascript',
  'python',
  'html',
  'css',
  'json',
  'bash',
  'sql',
];
const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({ value: lang, label: lang }));

/**
 * Inserts literal text at the live caret within `blockId`'s own run,
 * splicing directly into that run's value — used for Enter (a real "\n",
 * not a block split: a code block is multi-line *within one block*, like a
 * <textarea>) and Tab (two literal spaces, since
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
 * Live-subscribes to every run in `runIds` (plural, unlike useRun) and
 * returns their values joined into one plain string — what
 * CodeHighlightOverlay feeds to the host's `highlightCode`. Reuses each
 * run's OWN store subscription (the same one TextRunSpan/useRun rely on),
 * not the block's, since a run's *value* changing (ordinary typing,
 * handleEnter/handleTab's literal-text splices, paste) only ever notifies
 * that run's subscribers — see EditableBlockContent's doc comments. A code
 * block's runIds are effectively always a single run after creation (every
 * edit path here splices into the existing run rather than creating new
 * ones), but this stays correct for however many there are.
 */
function useCodeText(store, runIds) {
  const subscribe = useCallback(
    (onStoreChange) => {
      const unsubscribes = runIds.map((id) => store.subscribe(id, onStoreChange));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [store, runIds],
  );
  const getSnapshot = useCallback(
    () => runIds.map((id) => store.getRun(id)?.value ?? '').join(''),
    [store, runIds],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Read-only syntax-colored text, layered via CSS directly behind the real
 * editable layer (which CodeBlock makes text-transparent, caret still
 * visible, whenever this renders — see the be-code-block-highlighted class
 * below) — the same "highlighted overlay behind a transparent live editor"
 * technique react-simple-code-editor/CodeMirror-style widgets use. Typing,
 * selection, undo/redo all keep going through the ordinary plain-text run
 * the rest of this file already uses for code blocks; only the *painted*
 * color comes from here. `aria-hidden` since it's pure decoration — the
 * real text (and its own accessible name) lives in the editable layer.
 *
 * Deliberately a `<span>`, not a `<code>` — this sits as a sibling of the
 * real `<code>` inside `.be-code-block-pre`, and `.be-code-block-pre code {
 * position: relative; display: block; }` (meant only for the real one)
 * would otherwise ALSO match this element by tag, at higher CSS specificity
 * (0-1-1) than `.be-code-block-highlight`'s own `position: absolute`
 * (0-1-0) — silently overriding it back to `position: relative`. That left
 * this element sitting in normal document flow instead of being pulled out
 * of it: a full-height, full-width copy of the code shoved BEFORE the real
 * editable text, pushing it down by the overlay's own height, rendering as
 * two stacked, slightly offset copies of the same content instead of one
 * layered on top of the other. Any element tag that isn't `code` sidesteps
 * the collision entirely.
 */
function CodeHighlightOverlay({ store, runIds, language, highlightCode }) {
  const code = useCodeText(store, runIds);
  const html = highlightCode(code, language);
  return (
    <span
      className="be-code-block-highlight"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
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
 * No syntax highlighter ships with this package (tokenizing/coloring code
 * needs one, which the zero-runtime-dependency constraint rules out
 * bundling) — but a host app can wire its own in via EditorProvider's
 * `highlightCode` prop (see useHighlightCode's doc comment), rendered as a
 * read-only colored overlay behind the real editable text. Without it, this
 * still renders as plain monochrome text like before. `props.language` is
 * kept as plain metadata (round-trips through copy/paste and serialization)
 * either way, and is exactly what gets passed to `highlightCode`.
 */
export function CodeBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const showLineNumbers = useShowLineNumbers();
  const highlightCode = useHighlightCode();

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
  // Display-only — derived fresh from the block's own text on every render,
  // never stored. Counts '\n's inserted by handleEnter above (this block's
  // multi-line-within-one-run model), not separate line blocks.
  const lineCount = showLineNumbers
    ? (block.contentIds
        .map((runId) => store.getRun(runId)?.value ?? '')
        .join('')
        .match(/\n/g)?.length ?? 0) + 1
    : 0;

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
        <button
          type="button"
          className="be-code-block-delete"
          onClick={handleDelete}
          aria-label="Delete code block"
          title="Delete code block"
        >
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
      <div className="be-code-block-body">
        {showLineNumbers && (
          <div className="be-code-block-gutter" contentEditable={false} aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        )}
        <pre
          className={
            highlightCode ? 'be-code-block-pre be-code-block-highlighted' : 'be-code-block-pre'
          }
          dir="ltr"
        >
          {highlightCode && (
            <CodeHighlightOverlay
              store={store}
              runIds={block.contentIds}
              language={language}
              highlightCode={highlightCode}
            />
          )}
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
    </div>
  );
}
