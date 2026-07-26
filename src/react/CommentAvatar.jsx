import { getAvatarColor, getInitials } from './commentFormatting.js';

/**
 * A small colored circle with the author's initials — this package has no
 * profile-picture/identity concept at all (see EditorProvider's
 * `commentAuthorId`), so every avatar is generated purely from the author
 * id/name string rather than a real image, the same "no identity, just an
 * id string" stance `authorId` already takes everywhere else in comments.
 */
export function CommentAvatar({ authorId, size = 26 }) {
  return (
    <span
      className="be-comment-avatar"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4), background: getAvatarColor(authorId) }}
      aria-hidden="true"
    >
      {getInitials(authorId)}
    </span>
  );
}
