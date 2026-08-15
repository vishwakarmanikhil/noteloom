import { describe, it, expect } from 'vitest';
import { markPendingAutoOpen, consumePendingAutoOpen } from '../../src/react/pendingAutoOpen.js';

describe('pendingAutoOpen', () => {
  it('a marked id is consumed exactly once — true the first time, false after', () => {
    markPendingAutoOpen('run-a');
    expect(consumePendingAutoOpen('run-a')).toBe(true);
    expect(consumePendingAutoOpen('run-a')).toBe(false);
  });

  it('an id that was never marked is never pending', () => {
    expect(consumePendingAutoOpen('never-marked')).toBe(false);
  });

  it('marking is independent per id', () => {
    markPendingAutoOpen('run-x');
    expect(consumePendingAutoOpen('run-y')).toBe(false);
    expect(consumePendingAutoOpen('run-x')).toBe(true);
  });
});
