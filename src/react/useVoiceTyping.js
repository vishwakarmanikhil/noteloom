import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useEditorStore } from './EditorProvider.jsx';
import { resolveCollapsedCaret } from './selectionResolve.js';
import { setCaretSync } from './focusRun.js';
import { updateRun } from '../store/operations.js';
import { matchVoiceCommand } from '../voice/voiceCommands.js';
import { applyVoiceAction } from '../voice/applyVoiceAction.js';

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

const PERMISSION_DENIED_MESSAGE =
  'Microphone access is blocked. Enable it in your browser\'s site settings, then try again.';

/**
 * Native-browser (Web Speech API) voice typing: live, continuous dictation
 * into the current caret position (text appears and self-corrects as you
 * speak, not just after each pause), plus spoken structural commands
 * ("heading one", "new paragraph", "undo", "stop dictation", ...)
 * recognized via voiceCommands.js — see that file for the full command
 * table and matching rules (also exported there as listVoiceCommands() for
 * an in-app "what can I say" help list).
 *
 * Deliberately built on the browser's own SpeechRecognition rather than a
 * bundled speech-to-text SDK: real speech recognition needs either a
 * network round-trip to a vendor's servers or a genuinely heavy on-device
 * model, either of which conflicts with this package staying zero-runtime-
 * dependency. `isSupported` is false (start()/stop() are no-ops) wherever
 * the API doesn't exist (Firefox, most notably) — a host app decides how
 * to surface that (hide the mic button, show a note, etc.), this hook just
 * degrades safely rather than throwing.
 *
 * ---- Never trust SpeechRecognition's resultIndex for phrase identity —
 * this is the part two earlier versions of this hook got wrong ----
 *
 * `sessionAnchorRef` (`{ runId, blockId, offset }`) is this hook's own,
 * single source of truth for "where does the next chunk of dictated text
 * go" — resolved from the real caret exactly *once*, when `start()` is
 * called, and after that updated *only* by this hook's own writes; it is
 * never re-read from `window.getSelection()` mid-session.
 *
 * `liveEntryRef` is the *one* mutable "currently being revised, not yet
 * final" text buffer — on every `onresult` event, every non-final result
 * in that event is concatenated into one string and used to *fully
 * replace* this single buffer's contents, regardless of which
 * `resultIndex`(es) the browser happened to report them under.
 * `committedCountRef` is a separate, monotonically-increasing "how many
 * result indices have I already permanently committed" counter, advanced
 * only when *this hook* finalizes something — used purely as a "don't
 * reprocess an index I already committed" guard, never for matching a new
 * event's index back to an existing in-progress phrase.
 *
 * This design replaced two earlier, both-broken attempts at using
 * `resultIndex` as a phrase identifier:
 *   1. Tracking a `Map` of every "in-flight" phrase keyed by resultIndex,
 *      re-resolving the live caret each time a new index appeared. Real
 *      Chrome doesn't keep resultIndex behaving cleanly enough for that —
 *      a later index could get matched against a stale map entry, and
 *      text landed out of order ("11234567 89 10 11 ..." for numbers
 *      spoken in order).
 *   2. Comparing consecutive events' resultIndex to decide "is this a
 *      revision of the same phrase, or a new one" (one phrase at a time,
 *      no Map). Real Chrome can advance resultIndex on what is still
 *      conceptually the same in-progress phrase, which made this treat
 *      every revision as a brand-new phrase, anchored after the
 *      previous (wrongly-separate) one's text — producing runaway,
 *      compounding duplication ("test for the" -> "test for the life" ->
 *      "test for the life desc" -> ... each revision re-typing the whole
 *      growing sentence from scratch instead of replacing the last guess).
 *
 * Concatenate-all-non-final-into-one-buffer is the standard pattern real
 * speech-to-text integrations use (e.g. how the `react-speech-recognition`
 * library and most Web Speech API tutorials build up "interim transcript"
 * + "final transcript" separately) — it needs no assumption whatsoever
 * about how the browser indexes results across events.
 *
 * Every write still goes through `flushSync` (react-dom) before
 * `setCaretSync` (the non-rAF variant of focusRunAtOffset, see
 * focusRun.js) moves the *visible* caret to match — `TextRunSpan`
 * (EditableBlockContent.jsx) fully destroys and recreates the run's DOM
 * text node on every value change, which resets the browser's native
 * Selection, and a plain `store.applyOperation(...)` call is not
 * guaranteed to have committed that DOM change by the time it returns
 * (React may batch it) — `flushSync` forces the commit first. This part
 * only affects what the user visually sees the caret doing; the actual
 * text-insertion math never depends on it, since `sessionAnchorRef` is the
 * authority, not the DOM.
 *
 * Text is inserted/updated plain, with no "tentative" styling while
 * interim — it just grows and occasionally self-corrects as the engine
 * hears more context, the same way Google's own voice typing behaves.
 *
 * Command detection vs. plain dictation: only a *finalized* segment is
 * ever checked against the command table (matchVoiceCommand) — natural
 * pauses in speech are what the Speech API itself uses to decide a segment
 * is "final", so a command spoken as its own isolated utterance is
 * detected reliably, while the same words embedded in a longer dictated
 * sentence never match (the whole segment has to equal a known phrase,
 * not just contain one). If a phrase that was already live-inserted as
 * interim text finalizes as a command, the interim text is reverted
 * (removed) before the command runs — so e.g. saying "heading one" never
 * leaves "heading one" sitting in the paragraph before converting it, even
 * though "heading" alone may have briefly appeared while still mid-
 * utterance.
 *
 * `status` (`'idle' | 'listening' | 'processing'`) is driven by the Speech
 * API's own `onspeechstart`/`onspeechend` events, not a fabricated timer:
 * `onspeechend` fires when the engine detects you've stopped talking and is
 * about to finalize what it heard ('processing'), and the next committed
 * final result (or a fresh `onspeechstart`) returns to 'listening'. Neither
 * event is guaranteed on every engine — if they never fire, status simply
 * stays 'listening' for the whole session, a safe degrade, not a crash.
 * `VoiceListeningIndicator` (also exported) renders a small badge that
 * follows the live caret off this state.
 *
 * Mic permission: `recognition.onerror` reporting 'not-allowed' or
 * 'service-not-allowed' is the one cross-browser-reliable signal that
 * permission was denied (the Permissions API's 'microphone' descriptor
 * isn't supported in Firefox at all, and is inconsistent in Safari) — that
 * error sets `permissionState: 'denied'`. Where the Permissions API *is*
 * available, it's also queried opportunistically on mount (and its own
 * `change` event subscribed to) purely so a previously-denied permission
 * shows up in `permissionState` before the user even presses the mic
 * button, rather than only ever finding out after a failed start().
 * `VoicePermissionModal` (also exported) renders itself automatically off
 * this same state.
 *
 * `options.shortcut` (default true) wires one native, document-level
 * Ctrl/Cmd+Shift+M keydown listener that toggles start()/stop() — pass
 * `{ shortcut: false }` to opt out if a host wants its own binding.
 */
export function useVoiceTyping({ shortcut = true } = {}) {
  const store = useEditorStore();
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('idle');
  const [permissionState, setPermissionState] = useState('unknown');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  // { runId, blockId, offset } | null — this hook's single, internally-
  // owned source of truth for "where does dictation write next." See the
  // class comment for why this is never re-read from the live DOM
  // mid-session.
  const sessionAnchorRef = useRef(null);
  // The one, single "still being revised" text buffer — replaced wholesale
  // on every onresult event, never matched against a prior event by index.
  // { runId, blockId, startOffset, insertedLength, needsLeadingSpace } | null
  const liveEntryRef = useRef(null);
  // How many result indices this hook has already permanently committed —
  // only ever advanced by this hook itself; used solely to avoid
  // reprocessing an index already committed, never to identify a phrase.
  const committedCountRef = useRef(0);
  const isSupported = getSpeechRecognitionCtor() !== null;

  useEffect(() => {
    if (!navigator.permissions?.query) return undefined;
    let permissionStatus;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'microphone' })
      .then((result) => {
        if (cancelled) return;
        permissionStatus = result;
        setPermissionState(result.state);
        permissionStatus.onchange = () => setPermissionState(permissionStatus.state);
      })
      .catch(() => {}); // unsupported descriptor name (e.g. Safari) — fall back to onerror-only detection
    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  const createEntryAtAnchor = useCallback(() => {
    if (!sessionAnchorRef.current) {
      const caret = resolveCollapsedCaret();
      if (!caret) return null;
      sessionAnchorRef.current = caret;
    }
    return {
      runId: sessionAnchorRef.current.runId,
      blockId: sessionAnchorRef.current.blockId,
      startOffset: sessionAnchorRef.current.offset,
      insertedLength: 0,
    };
  }, []);

  const writeEntryText = useCallback(
    (entry, text) => {
      const run = store.getRun(entry.runId);
      if (!run || run.type !== 'text') return;
      const value = run.value ?? '';
      const before = value.slice(0, entry.startOffset);
      // The leading-space decision is made once, against whatever sat
      // right before the anchor when this phrase began, and reused for
      // every revision of this same phrase — recomputing it against the
      // phrase's *own* still-growing text on each revision would flip it
      // back and forth as that text changes shape.
      if (entry.needsLeadingSpace === undefined) {
        const beforeChar = before[before.length - 1];
        entry.needsLeadingSpace = entry.startOffset > 0 && beforeChar !== undefined && !/\s/.test(beforeChar);
      }
      const insertedText = (entry.needsLeadingSpace ? ' ' : '') + text;
      const after = value.slice(entry.startOffset + entry.insertedLength);
      // flushSync forces React to synchronously commit this store write
      // (including TextRunSpan's DOM-rewriting layout effect) before it
      // returns, so setCaretSync right after is guaranteed to see the
      // freshly-rewritten text node rather than a stale one.
      flushSync(() => store.applyOperation(updateRun(entry.runId, { value: before + insertedText + after })));
      entry.insertedLength = insertedText.length;
      setCaretSync(entry.runId, entry.startOffset + insertedText.length);
      sessionAnchorRef.current = { runId: entry.runId, blockId: entry.blockId, offset: entry.startOffset + insertedText.length };
    },
    [store],
  );

  const revertEntryText = useCallback(
    (entry) => {
      const run = store.getRun(entry.runId);
      if (!run || run.type !== 'text') return;
      const value = run.value ?? '';
      const restored = value.slice(0, entry.startOffset) + value.slice(entry.startOffset + entry.insertedLength);
      flushSync(() => store.applyOperation(updateRun(entry.runId, { value: restored })));
      setCaretSync(entry.runId, entry.startOffset);
      sessionAnchorRef.current = { runId: entry.runId, blockId: entry.blockId, offset: entry.startOffset };
    },
    [store],
  );

  const handleRecognitionResult = useCallback(
    (event) => {
      let interimText = '';
      let hasInterim = false;
      const start = Math.max(event.resultIndex, committedCountRef.current);

      for (let i = start; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';

        if (!result.isFinal) {
          interimText += (interimText ? ' ' : '') + transcript;
          hasInterim = true;
          continue;
        }

        // Finalizing: reuse the live buffer if one exists (the common
        // case — this text was almost certainly interim a moment ago),
        // otherwise create a fresh one (a short utterance can finalize
        // with no prior interim event at all).
        const entry = liveEntryRef.current ?? createEntryAtAnchor();
        liveEntryRef.current = null;
        committedCountRef.current = i + 1;
        if (!entry) continue; // nowhere to anchor — drop this one

        const command = matchVoiceCommand(transcript);
        if (command) {
          revertEntryText(entry); // the interim guess was never real content
          if (command.type === 'stopDictation') {
            recognitionRef.current?.stop();
          } else {
            applyVoiceAction(store, entry.blockId, command);
            // The command may have moved focus into a different block/run
            // (e.g. a new paragraph) via this codebase's usual rAF-deferred
            // focus helpers — force the next phrase to re-resolve the live
            // caret rather than trusting a position that's now stale.
            sessionAnchorRef.current = null;
            setStatus('listening');
          }
        } else {
          writeEntryText(entry, transcript);
          setStatus('listening');
        }
      }

      if (hasInterim) {
        const entry = liveEntryRef.current ?? createEntryAtAnchor();
        if (entry) {
          liveEntryRef.current = entry;
          writeEntryText(entry, interimText);
        }
      }
    },
    [store, createEntryAtAnchor, writeEntryText, revertEntryText],
  );

  const start = useCallback(() => {
    if (!isSupported || recognitionRef.current) return;
    setError(null);
    sessionAnchorRef.current = resolveCollapsedCaret();
    liveEntryRef.current = null;
    committedCountRef.current = 0;
    const Ctor = getSpeechRecognitionCtor();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = handleRecognitionResult;
    recognition.onstart = () => setStatus('listening');
    recognition.onspeechstart = () => setStatus('listening');
    recognition.onspeechend = () => setStatus('processing');
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPermissionState('denied');
        setError(PERMISSION_DENIED_MESSAGE);
      } else {
        setError(event.error ?? 'Voice typing stopped unexpectedly.');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      sessionAnchorRef.current = null;
      liveEntryRef.current = null;
      committedCountRef.current = 0;
      setIsListening(false);
      setStatus('idle');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, handleRecognitionResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    if (!shortcut || !isSupported) return undefined;
    const handleKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || !event.shiftKey || event.key.toLowerCase() !== 'm') return;
      event.preventDefault();
      if (recognitionRef.current) stop();
      else start();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, isSupported, start, stop]);

  return { isSupported, isListening, status, permissionState, error, start, stop };
}
