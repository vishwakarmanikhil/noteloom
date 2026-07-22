import { HLC } from './clock.js';

/**
 * Tracks the logical-clock high-water mark for individual mutable fields
 * (a block's type, one prop key, a run's value, ...) so that when a
 * remote peer's write arrives it's only applied if it's actually newer
 * than whatever's already there — last-write-wins, scoped per field
 * rather than per whole block/run, so unrelated concurrent edits (peer A
 * changes the type, peer B changes a prop) both survive.
 */
export class FieldClockRegistry {
  constructor() {
    this.clocks = new Map();
  }

  static compositeKey(id, field) {
    return `${id}:${field}`;
  }

  get(id, field) {
    return this.clocks.get(FieldClockRegistry.compositeKey(id, field)) ?? null;
  }

  /** Local write: always wins outright — it just happened, nothing to compare against. */
  recordLocal(id, field, clock) {
    this.clocks.set(FieldClockRegistry.compositeKey(id, field), clock);
  }

  /**
   * Whether a remote write to this field should be applied. Callers must
   * check this before mutating so a stale remote write can be discarded
   * without ever touching local state.
   */
  shouldApplyRemote(id, field, remoteClock) {
    const current = this.get(id, field);
    if (!current) return true;
    return HLC.compare(remoteClock, current) > 0;
  }

  recordRemote(id, field, remoteClock) {
    this.clocks.set(FieldClockRegistry.compositeKey(id, field), remoteClock);
  }
}
