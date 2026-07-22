import { describe, it, expect } from 'vitest';
import { HLC } from '../../src/crdt/clock.js';

describe('HLC', () => {
  it('ticks strictly increasing timestamps for the same peer', () => {
    const clock = new HLC('peer-a');
    const t1 = clock.tick();
    const t2 = clock.tick();
    expect(HLC.compare(t1, t2)).toBeLessThan(0);
  });

  it('advances past a received remote timestamp', () => {
    const local = new HLC('peer-a');
    const remote = new HLC('peer-b');

    const remoteTs = remote.tick();
    local.receive(remoteTs);
    const nextLocal = local.tick();

    expect(HLC.compare(nextLocal, remoteTs)).toBeGreaterThan(0);
  });

  it('breaks ties deterministically by peerId when wallTime and counter match', () => {
    const a = { wallTime: 100, counter: 0, peerId: 'a' };
    const b = { wallTime: 100, counter: 0, peerId: 'b' };
    expect(HLC.compare(a, b)).toBeLessThan(0);
    expect(HLC.compare(b, a)).toBeGreaterThan(0);
    expect(HLC.compare(a, { ...a })).toBe(0);
  });
});
