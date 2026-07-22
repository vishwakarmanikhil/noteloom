import { describe, it, expect } from 'vitest';
import { HLC } from '../../src/crdt/clock.js';
import { FieldClockRegistry } from '../../src/crdt/fieldRegistry.js';

describe('FieldClockRegistry — basic LWW', () => {
  it('has no recorded clock for an untouched field', () => {
    const registry = new FieldClockRegistry();
    expect(registry.get('block-1', 'type')).toBeNull();
  });

  it('a remote write always applies when nothing has been recorded yet', () => {
    const registry = new FieldClockRegistry();
    const remoteClock = new HLC('peer-b').tick();
    expect(registry.shouldApplyRemote('block-1', 'type', remoteClock)).toBe(true);
  });

  it('a newer remote write beats an older recorded one', () => {
    const registry = new FieldClockRegistry();
    const early = new HLC('peer-a');
    registry.recordLocal('block-1', 'type', early.tick());

    const later = new HLC('peer-b');
    later.receive(registry.get('block-1', 'type'));
    const remoteClock = later.tick();

    expect(registry.shouldApplyRemote('block-1', 'type', remoteClock)).toBe(true);
  });

  it('a stale remote write is rejected in favor of what is already recorded', () => {
    const registry = new FieldClockRegistry();
    const local = new HLC('peer-a');
    const localClock = local.tick();
    registry.recordLocal('block-1', 'type', localClock);

    const staleRemoteClock = { wallTime: localClock.wallTime - 1000, counter: 0, peerId: 'peer-b' };
    expect(registry.shouldApplyRemote('block-1', 'type', staleRemoteClock)).toBe(false);
  });
});

describe('FieldClockRegistry — concurrent type-conversion scenario', () => {
  it('when two peers concurrently convert the same block to different types, the newer clock wins deterministically on both sides', () => {
    // Peer A converts block#42 to "heading", peer B concurrently converts
    // the same block to "callout". Both peers replay both writes; the
    // side with the higher HLC must win identically everywhere.
    const clockA = new HLC('peer-a');
    const clockB = new HLC('peer-b');
    const tsA = clockA.tick();
    const tsB = clockB.tick(); // happens-after tsA in wall-clock terms in this test, but genuinely concurrent (neither observed the other)

    const registryOnA = new FieldClockRegistry();
    const registryOnB = new FieldClockRegistry();

    // Each peer applies its own write locally first...
    registryOnA.recordLocal('block-42', 'type', tsA);
    registryOnB.recordLocal('block-42', 'type', tsB);

    // ...then receives the other peer's write remotely.
    const aAcceptsB = registryOnA.shouldApplyRemote('block-42', 'type', tsB);
    if (aAcceptsB) registryOnA.recordRemote('block-42', 'type', tsB);

    const bAcceptsA = registryOnB.shouldApplyRemote('block-42', 'type', tsA);
    if (bAcceptsA) registryOnB.recordRemote('block-42', 'type', tsA);

    const winner = HLC.compare(tsA, tsB) > 0 ? tsA : tsB;
    expect(registryOnA.get('block-42', 'type')).toEqual(winner);
    expect(registryOnB.get('block-42', 'type')).toEqual(winner);
  });

  it('unrelated concurrent field writes on the same block (type vs. a prop) both survive independently', () => {
    const registryOnA = new FieldClockRegistry();
    const registryOnB = new FieldClockRegistry();
    const a = new HLC('peer-a');
    const b = new HLC('peer-b');

    const typeClock = a.tick();
    registryOnA.recordLocal('block-1', 'type', typeClock);

    const propClock = b.tick();
    registryOnB.recordLocal('block-1', 'props.color', propClock);

    // cross-apply
    if (registryOnB.shouldApplyRemote('block-1', 'type', typeClock)) {
      registryOnB.recordRemote('block-1', 'type', typeClock);
    }
    if (registryOnA.shouldApplyRemote('block-1', 'props.color', propClock)) {
      registryOnA.recordRemote('block-1', 'props.color', propClock);
    }

    expect(registryOnA.get('block-1', 'type')).toEqual(typeClock);
    expect(registryOnA.get('block-1', 'props.color')).toEqual(propClock);
    expect(registryOnB.get('block-1', 'type')).toEqual(typeClock);
    expect(registryOnB.get('block-1', 'props.color')).toEqual(propClock);
  });
});
