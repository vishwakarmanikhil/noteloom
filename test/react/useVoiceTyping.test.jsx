import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useVoiceTyping } from '../../src/react/useVoiceTyping.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
  };
}

function selectCollapsedAt(runNode, offset) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// A minimal stand-in for the real browser SpeechRecognition constructor —
// captures the handlers useVoiceTyping wires up so tests can fire a
// SpeechRecognitionEvent-shaped object directly, without needing a real
// microphone/engine (impossible under jsdom anyway).
class FakeSpeechRecognition {
  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
}
FakeSpeechRecognition.instances = [];

// Real SpeechRecognitionEvent.results is the *cumulative* results list —
// results[resultIndex] is the entry this event is actually reporting on,
// with every earlier index already finalized. Pad with placeholder
// finalized entries so results[resultIndex] lands at the right index; the
// handler never looks at anything before event.resultIndex anyway.
function resultEvent(transcript, resultIndex, isFinal) {
  const results = [];
  for (let i = 0; i < resultIndex; i += 1) results.push({ isFinal: true, 0: { transcript: '' }, length: 1 });
  results.push({ isFinal, 0: { transcript }, length: 1 });
  return { resultIndex, results };
}

function finalResultEvent(transcript, resultIndex = 0) {
  return resultEvent(transcript, resultIndex, true);
}

function interimResultEvent(transcript, resultIndex = 0) {
  return resultEvent(transcript, resultIndex, false);
}

let voiceApi;
function Harness({ options }) {
  voiceApi = useVoiceTyping(options);
  return <BlockChildren parentId="root" />;
}

function renderHarness(store, options) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <Harness options={options} />
    </EditorProvider>,
  );
}

describe('useVoiceTyping: feature detection', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });

  it('isSupported is false, and start() is a no-op, when the browser has no SpeechRecognition API', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    expect(voiceApi.isSupported).toBe(false);
    expect(() => act(() => voiceApi.start())).not.toThrow();
    expect(voiceApi.isListening).toBe(false);
  });

  it('isSupported is true when window.webkitSpeechRecognition exists', () => {
    window.webkitSpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    expect(voiceApi.isSupported).toBe(true);
  });
});

describe('useVoiceTyping: dictation and commands', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    FakeSpeechRecognition.instances = [];
  });

  it('splices a final dictated segment into the run at the current caret offset', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5); // end of "hello"

    act(() => recognition.onresult(finalResultEvent('world')));

    expect(store.getRun('r1').value).toBe('hello world'); // word-separating space inserted
  });

  it('a spoken command converts the current block instead of being dictated as text', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(finalResultEvent('heading one')));

    const newBlockId = store.getBlock('root').contentIds[0];
    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('heading');
    expect(newBlock.props.level).toBe(1);
    expect(store.getRun(newBlock.contentIds[0]).value).toBe('hello'); // dictated text preserved, not replaced
  });

  it('stop() ends the recognition session and isListening goes back to false', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    act(() => voiceApi.start());
    expect(voiceApi.isListening).toBe(true);

    act(() => voiceApi.stop());
    expect(voiceApi.isListening).toBe(false);
  });

  it('a "stop dictation" voice command stops the session, instead of being dictated as text', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(finalResultEvent('stop dictation')));

    expect(voiceApi.isListening).toBe(false);
    expect(store.getRun('r1').value).toBe('hello'); // not dictated as text
  });
});

describe('useVoiceTyping: live interim dictation (regression: caret corruption)', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    FakeSpeechRecognition.instances = [];
  });

  it('inserts interim text live, then revises it in place as the engine refines its guess (no duplication)', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5); // end of "hello"

    act(() => recognition.onresult(interimResultEvent('wor')));
    expect(store.getRun('r1').value).toBe('hello wor');

    act(() => recognition.onresult(interimResultEvent('world')));
    expect(store.getRun('r1').value).toBe('hello world'); // replaced in place, not appended again

    act(() => recognition.onresult(finalResultEvent('world')));
    expect(store.getRun('r1').value).toBe('hello world');
  });

  it('the caret lands at the correct offset immediately (synchronously) after each interim revision — no rAF/timer flush needed', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    // No act(async ...) / timer flush anywhere below — if caret restore
    // were still rAF-deferred (the original bug), the selection checked
    // immediately after would still be in whatever broken state
    // host.textContent's rewrite left it in, not at the real end offset.
    act(() => recognition.onresult(interimResultEvent('wor')));
    let selection = window.getSelection();
    expect(selection.anchorNode.textContent).toBe('hello wor');
    expect(selection.anchorOffset).toBe('hello wor'.length);

    act(() => recognition.onresult(interimResultEvent('world')));
    selection = window.getSelection();
    expect(selection.anchorNode.textContent).toBe('hello world');
    expect(selection.anchorOffset).toBe('hello world'.length);
  });

  it('a phrase that grows through several interim revisions before finalizing lands as one clean insertion', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(interimResultEvent('the')));
    act(() => recognition.onresult(interimResultEvent('the quick')));
    act(() => recognition.onresult(interimResultEvent('the quick brown')));
    act(() => recognition.onresult(finalResultEvent('the quick brown fox')));

    expect(store.getRun('r1').value).toBe('hello the quick brown fox');
  });

  it('two consecutive finalized phrases (two result indices), the second anchored at wherever the caret landed after the first, each get their own space-separated insertion', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(finalResultEvent('world', 0)));
    expect(store.getRun('r1').value).toBe('hello world');

    // Deliberately NOT re-selecting the caret manually here — this is the
    // whole point of the fix: the caret left behind by the first phrase's
    // synchronous restore must already be correct for the second phrase to
    // anchor off of it correctly, with no explicit re-selection needed.
    act(() => recognition.onresult(finalResultEvent('again', 1)));
    expect(store.getRun('r1').value).toBe('hello world again');
  });

  it('an utterance that starts as interim text and finalizes as a command reverts the interim text before converting the block', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(interimResultEvent('heading')));
    expect(store.getRun('r1').value).toBe('hello heading'); // briefly live as plain text, mid-utterance

    act(() => recognition.onresult(finalResultEvent('heading one')));

    // reverted, not left behind as literal text:
    expect(store.getRun('r1').value).toBe('hello');
    const newBlockId = store.getBlock('root').contentIds[0];
    expect(store.getBlock(newBlockId).type).toBe('heading');
    expect(store.getBlock(newBlockId).props.level).toBe(1);
  });

  it('a long run of continuous numbers, each delivered as its own rapid-fire finalized result index, lands in speaking order (regression: real Chrome does not guarantee clean sequential resultIndex behavior)', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5); // end of "hello"

    const words = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    words.forEach((word, i) => {
      act(() => recognition.onresult(finalResultEvent(word, i)));
    });

    expect(store.getRun('r1').value).toBe('hello 1 2 3 4 5 6 7 8 9 10');
  });

  it('ignores a stale re-report of an already-committed resultIndex entirely, rather than reprocessing it as new content', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onresult(finalResultEvent('world', 0)));
    expect(store.getRun('r1').value).toBe('hello world');

    // A quirky engine re-reports index 0 as final again, instead of
    // advancing to index 1 — the committedCountRef guard means this is
    // simply ignored (index 0 was already committed), not reprocessed as
    // if it were new content landing at the current position.
    act(() => recognition.onresult(finalResultEvent('again', 0)));
    expect(store.getRun('r1').value).toBe('hello world');

    // A genuinely new index still works normally afterward.
    act(() => recognition.onresult(finalResultEvent('again', 1)));
    expect(store.getRun('r1').value).toBe('hello world again');
  });

  it('an interim phrase that keeps revising for a long time never drifts from its own anchor, even across many revisions', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    let partial = '';
    for (const word of ['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen']) {
      partial = partial ? `${partial} ${word}` : word;
      act(() => recognition.onresult(interimResultEvent(partial)));
    }
    act(() => recognition.onresult(finalResultEvent(partial)));

    expect(store.getRun('r1').value).toBe('hello eleven twelve thirteen fourteen fifteen sixteen');
  });

  it('never compounds/duplicates when the engine advances resultIndex on what is still the same in-progress phrase (regression: real Chrome does this, and the previous per-index-identity design treated every revision as a brand-new phrase)', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5); // end of "hello"

    // Each revision of the SAME growing sentence, but — unlike a
    // well-behaved engine — resultIndex advances by one on every single
    // call instead of staying put until finalized. This is exactly the
    // shape that produced the real "test for the" -> "test for the life"
    // -> "test for the life desc" -> ... compounding-duplication bug.
    const revisions = ['test', 'test for', 'test for the'];
    revisions.forEach((partial, i) => {
      act(() => recognition.onresult(interimResultEvent(partial, i)));
    });
    act(() => recognition.onresult(finalResultEvent('test for the win', revisions.length)));

    expect(store.getRun('r1').value).toBe('hello test for the win');
  });
});

describe('useVoiceTyping: mic permission', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete navigator.permissions;
    FakeSpeechRecognition.instances = [];
  });

  it('recognition.onerror("not-allowed") sets permissionState to denied and stops listening', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];

    act(() => recognition.onerror({ error: 'not-allowed' }));

    expect(voiceApi.permissionState).toBe('denied');
    expect(voiceApi.error).toMatch(/microphone/i);
  });

  it('an unrelated recognition error sets a generic error message without touching permissionState', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];

    act(() => recognition.onerror({ error: 'network' }));

    expect(voiceApi.permissionState).toBe('unknown');
    expect(voiceApi.error).toBe('network');
  });

  it('opportunistically reflects an already-denied Permissions API state on mount, before start() is ever called', async () => {
    let changeHandler;
    const status = {
      state: 'denied',
      set onchange(handler) {
        changeHandler = handler;
      },
    };
    navigator.permissions = { query: vi.fn().mockResolvedValue(status) };

    const store = new EditorStore(makeDoc());
    await act(async () => {
      renderHarness(store);
      await Promise.resolve();
    });

    expect(voiceApi.permissionState).toBe('denied');
    expect(typeof changeHandler).toBe('function'); // subscribed for live updates too
  });
});

describe('useVoiceTyping: Ctrl/Cmd+Shift+M keyboard shortcut', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    FakeSpeechRecognition.instances = [];
  });

  it('toggles start/stop on Ctrl+Shift+M by default', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    fireEvent.keyDown(document, { key: 'm', ctrlKey: true, shiftKey: true });
    expect(voiceApi.isListening).toBe(true);

    fireEvent.keyDown(document, { key: 'M', ctrlKey: true, shiftKey: true });
    expect(voiceApi.isListening).toBe(false);
  });

  it('does not wire the shortcut at all when shortcut: false is passed', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store, { shortcut: false });

    fireEvent.keyDown(document, { key: 'm', ctrlKey: true, shiftKey: true });
    expect(voiceApi.isListening).toBe(false);
  });
});

describe('useVoiceTyping: listening/processing status', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    FakeSpeechRecognition.instances = [];
  });

  it('is "idle" before starting, "listening" once started, and back to "idle" once stopped', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    expect(voiceApi.status).toBe('idle');

    act(() => voiceApi.start());
    expect(voiceApi.status).toBe('listening');

    act(() => voiceApi.stop());
    expect(voiceApi.status).toBe('idle');
  });

  it('moves to "processing" on onspeechend, and back to "listening" once a final result lands', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onspeechend?.());
    expect(voiceApi.status).toBe('processing');

    act(() => recognition.onresult(finalResultEvent('world')));
    expect(voiceApi.status).toBe('listening');
  });

  it('onspeechstart returns status to "listening" (e.g. after a processing gap)', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];

    act(() => recognition.onspeechend?.());
    expect(voiceApi.status).toBe('processing');

    act(() => recognition.onspeechstart?.());
    expect(voiceApi.status).toBe('listening');
  });

  it('a command that finalizes also returns status to "listening"', () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    act(() => voiceApi.start());
    const recognition = FakeSpeechRecognition.instances[0];
    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 5);

    act(() => recognition.onspeechend?.());
    expect(voiceApi.status).toBe('processing');

    act(() => recognition.onresult(finalResultEvent('heading one')));
    expect(voiceApi.status).toBe('listening');
  });
});
