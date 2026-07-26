// Same five colors FloatingToolbar's own text-color picker already offers
// (see TEXT_COLORS in FloatingToolbar.jsx) — reused here rather than a new
// palette, so an author's avatar color and any text color a user might pick
// come from the same small, already-approved set.
const AVATAR_COLORS = ['#e03131', '#e8590c', '#2f9e44', '#1971c2', '#9c36b5'];

/**
 * Deterministically picks one of AVATAR_COLORS for `authorId` — this
 * package has no identity system of its own (no profile pictures, no
 * stored user records), so every avatar is generated from the id/name
 * string alone, and needs to land on the SAME color every time for the
 * same author without any lookup.
 */
export function getAvatarColor(authorId) {
  let hash = 0;
  const str = String(authorId ?? '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** "Bailey Chen" -> "BC", "alice" -> "AL", "" -> "?". */
export function getInitials(authorId) {
  const str = String(authorId ?? '').trim();
  if (!str) return '?';
  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "just now" / "5 min ago" / "3 hours ago" / "2 days ago", falling back to
 * a plain locale date beyond a week — a display-only nicety computed fresh
 * on each render; `CommentMessage.createdAt` itself stays a plain epoch-ms
 * number everywhere else (storage, collab envelopes, exports).
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = now - timestamp;
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / MINUTE_MS);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 7 * DAY_MS) {
    const d = Math.floor(diff / DAY_MS);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}
