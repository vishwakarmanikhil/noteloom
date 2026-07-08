import { describe, it, expect } from 'vitest';
import { reconcileDomToRuns, EMPTY_RUN_PLACEHOLDER } from '../../src/react/domRunSync.js';

function makeContainer(children) {
  const container = document.createElement('div');
  for (const child of children) {
    if (typeof child === 'string') {
      container.appendChild(document.createTextNode(child));
    } else {
      const span = document.createElement('span');
      span.setAttribute('data-run-id', child.runId);
      span.textContent = child.text;
      container.appendChild(span);
    }
  }
  return container;
}

describe('reconcileDomToRuns: fast path (typing within existing spans)', () => {
  it('detects a value change within one run, same identity and order', () => {
    const currentRuns = [
      { id: 'r1', type: 'text', value: 'hello', marks: {} },
      { id: 'r2', type: 'text', value: 'world', marks: {} },
    ];
    const container = makeContainer([
      { runId: 'r1', text: 'hello!' }, // user typed "!"
      { runId: 'r2', text: 'world' },
    ]);

    const result = reconcileDomToRuns(container, currentRuns);

    expect(result.onlyValueChanges).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.runs[0].value).toBe('hello!');
    expect(result.runs[0].id).toBe('r1');
    expect(result.runs[1]).toBe(currentRuns[1]); // untouched run: same reference
  });

  it('reports unchanged when nothing actually differs', () => {
    const currentRuns = [{ id: 'r1', type: 'text', value: 'hello', marks: {} }];
    const container = makeContainer([{ runId: 'r1', text: 'hello' }]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.changed).toBe(false);
    expect(result.runs[0]).toBe(currentRuns[0]);
  });

  it('never re-derives value for an atomic (non-text) run matched by id', () => {
    const currentRuns = [{ id: 'sel1', type: 'select', value: 'internal', marks: {}, data: { label: 'Option A' } }];
    // DOM textContent for an atomic chip might render "Option A" — must not become the run's value
    const container = makeContainer([{ runId: 'sel1', text: 'Option A' }]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.changed).toBe(false);
    expect(result.runs[0]).toBe(currentRuns[0]);
    expect(result.runs[0].value).toBe('internal');
  });
});

describe('reconcileDomToRuns: empty-run placeholder handling (regression)', () => {
  it('treats a span containing only the placeholder as still-empty (no false structural change)', () => {
    const currentRuns = [{ id: 'r1', type: 'text', value: '', marks: {} }];
    const container = makeContainer([{ runId: 'r1', text: EMPTY_RUN_PLACEHOLDER }]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.changed).toBe(false);
    expect(result.onlyValueChanges).toBe(true);
    expect(result.runs[0]).toBe(currentRuns[0]);
  });

  it('strips the placeholder out of typed text within the same run (fast path, no duplication)', () => {
    const currentRuns = [{ id: 'r1', type: 'text', value: '', marks: {} }];
    // browser anchored the caret in the placeholder and inserted "k" right after it
    const container = makeContainer([{ runId: 'r1', text: `${EMPTY_RUN_PLACEHOLDER}k` }]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.onlyValueChanges).toBe(true); // still the SAME run, just a value change
    expect(result.runs.length).toBe(1); // no duplicate/extra run created
    expect(result.runs[0].id).toBe('r1');
    expect(result.runs[0].value).toBe('k');
  });
});

describe('reconcileDomToRuns: slow path (structural changes)', () => {
  it('flags a brand-new unwrapped text node (e.g. typed before the first span)', () => {
    const currentRuns = [{ id: 'r1', type: 'text', value: 'world', marks: {} }];
    const container = makeContainer(['hello ', { runId: 'r1', text: 'world' }]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.onlyValueChanges).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.runs.length).toBe(2);
    expect(result.runs[0].value).toBe('hello ');
    expect(result.runs[1]).toBe(currentRuns[0]);
  });

  it('flags a run whose node disappeared entirely (e.g. atomic chip deleted natively)', () => {
    const currentRuns = [
      { id: 'r1', type: 'text', value: 'hello ', marks: {} },
      { id: 'sel1', type: 'select', value: 'x', marks: {}, data: {} },
    ];
    const container = makeContainer([{ runId: 'r1', text: 'hello ' }]); // sel1's span is gone

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.onlyValueChanges).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.runs).toEqual([currentRuns[0]]);
  });

  it('flags a reordering of existing run spans', () => {
    const currentRuns = [
      { id: 'r1', type: 'text', value: 'a', marks: {} },
      { id: 'r2', type: 'text', value: 'b', marks: {} },
    ];
    const container = makeContainer([
      { runId: 'r2', text: 'b' },
      { runId: 'r1', text: 'a' },
    ]);

    const result = reconcileDomToRuns(container, currentRuns);
    expect(result.onlyValueChanges).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.runs.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});
