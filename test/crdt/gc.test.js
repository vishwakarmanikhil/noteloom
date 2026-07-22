import { describe, it, expect, vi } from 'vitest';
import { createPeriodicTombstoneGC } from '../../src/crdt/gc.js';

function makeFakeStore(pruneResults) {
  let callIndex = 0;
  return {
    calls: [],
    pruneTombstones(options) {
      this.calls.push(options);
      const result = pruneResults[callIndex] ?? 0;
      callIndex += 1;
      return result;
    },
  };
}

describe('createPeriodicTombstoneGC', () => {
  it('calls store.pruneTombstones on the configured interval, with maxAgeMs threaded through', () => {
    vi.useFakeTimers();
    try {
      const store = makeFakeStore([0, 0, 0]);
      const { stop } = createPeriodicTombstoneGC({ store, intervalMs: 1000, maxAgeMs: 5000 });

      vi.advanceTimersByTime(3000); // 3 intervals
      expect(store.calls).toEqual([{ maxAgeMs: 5000 }, { maxAgeMs: 5000 }, { maxAgeMs: 5000 }]);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onPrune with the removed count, only when something was actually removed', () => {
    vi.useFakeTimers();
    try {
      const store = makeFakeStore([0, 3, 0]);
      const onPrune = vi.fn();
      const { stop } = createPeriodicTombstoneGC({ store, intervalMs: 1000, onPrune });

      vi.advanceTimersByTime(3000);
      expect(onPrune).toHaveBeenCalledTimes(1);
      expect(onPrune).toHaveBeenCalledWith(3);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() cancels the timer -- no further calls after stopping', () => {
    vi.useFakeTimers();
    try {
      const store = makeFakeStore([0, 0, 0, 0]);
      const { stop } = createPeriodicTombstoneGC({ store, intervalMs: 1000 });

      vi.advanceTimersByTime(2000);
      expect(store.calls.length).toBe(2);

      stop();
      vi.advanceTimersByTime(5000);
      expect(store.calls.length).toBe(2); // unchanged
    } finally {
      vi.useRealTimers();
    }
  });

  it('a thrown error from pruneTombstones is caught and reported via onError, not left uncaught', () => {
    vi.useFakeTimers();
    try {
      const store = {
        pruneTombstones() {
          throw new Error('boom');
        },
      };
      const onError = vi.fn();
      const { stop } = createPeriodicTombstoneGC({ store, intervalMs: 1000, onError });

      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe('boom');

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses sensible defaults (1h interval, 24h maxAge) when not overridden', () => {
    vi.useFakeTimers();
    try {
      const store = makeFakeStore([0]);
      const { stop } = createPeriodicTombstoneGC({ store });

      vi.advanceTimersByTime(60 * 60 * 1000 - 1);
      expect(store.calls.length).toBe(0);
      vi.advanceTimersByTime(1);
      expect(store.calls.length).toBe(1);
      expect(store.calls[0]).toEqual({ maxAgeMs: 24 * 60 * 60 * 1000 });

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
