import { useEffect, useState } from 'react';

/**
 * Reactive access to a `CollabSession`'s presence data — the live "who
 * else is here, and where" (cursor position, name, color, whatever the
 * host app puts into `setLocalPresence`) alongside the document sync.
 *
 * `session` is whatever `CollabSession` instance the host app already
 * constructed (this hook doesn't create one) — pass `null`/`undefined`
 * before it exists yet (e.g. still connecting) and this returns an empty
 * map rather than erroring.
 *
 * Returns a `Map<peerId, data>` of every OTHER peer's current presence
 * (never your own — you already know that). A new render only happens
 * when presence actually changes (a peer moves, joins, or disconnects),
 * same reference-stability contract as the rest of this package's hooks.
 */
export function usePresence(session) {
  const [presence, setPresence] = useState(() => session?.getPresence() ?? new Map());

  useEffect(() => {
    if (!session) {
      setPresence(new Map());
      return undefined;
    }
    setPresence(session.getPresence());
    return session.onPresenceChange(setPresence);
  }, [session]);

  return presence;
}
