/**
 * Hybrid Logical Clock — a (wallTime, counter, peerId) timestamp used to
 * totally order concurrent edits across peers without a central server.
 * wallTime keeps timestamps meaningful as real time (e.g. "edited 2 min
 * ago"); counter breaks ties when multiple local events share a wallTime;
 * peerId breaks ties deterministically when both wallTime and counter
 * match across peers.
 */
export class HLC {
  constructor(peerId) {
    this.peerId = peerId;
    this.wallTime = 0;
    this.counter = 0;
  }

  /** Local event (a user's own edit). Returns the stamped timestamp. */
  tick() {
    const now = Date.now();
    if (now > this.wallTime) {
      this.wallTime = now;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return { wallTime: this.wallTime, counter: this.counter, peerId: this.peerId };
  }

  /**
   * Merges in a timestamp observed from a remote peer, advancing this
   * clock so subsequent local ticks are guaranteed to sort after
   * anything just received.
   */
  receive(remote) {
    const now = Date.now();
    const maxWall = Math.max(now, this.wallTime, remote.wallTime);
    if (maxWall === this.wallTime && maxWall === remote.wallTime) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (maxWall === this.wallTime) {
      this.counter += 1;
    } else if (maxWall === remote.wallTime) {
      this.counter = remote.counter + 1;
    } else {
      this.counter = 0;
    }
    this.wallTime = maxWall;
    return { wallTime: this.wallTime, counter: this.counter, peerId: this.peerId };
  }

  /** Total order: wallTime, then counter, then peerId. */
  static compare(a, b) {
    if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
    if (a.counter !== b.counter) return a.counter - b.counter;
    if (a.peerId === b.peerId) return 0;
    return a.peerId < b.peerId ? -1 : 1;
  }
}

export function genPeerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `peer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
