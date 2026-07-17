import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCaretRect } from './useCaretRect.js';
import { useAutoAdjustedCenteredLeft } from './usePopoverEdgeClamp.js';
import { MicIcon } from './icons.jsx';

/**
 * Ready-made "voice typing is actively working" indicator for
 * useVoiceTyping — mount it once anywhere: `<VoiceListeningIndicator
 * voice={voice} />`. A toolbar-only status label is easy to miss since
 * attention is on the text being dictated, not the toolbar, so this
 * renders a small pulsing badge anchored right above the live caret
 * instead — the same `getBoundingClientRect()`-off-a-Range positioning
 * `FloatingToolbar`/`LinkHoverCard` already use elsewhere in this
 * codebase (see useCaretRect.js), so it visibly follows the caret as
 * dictated text streams in and moves it.
 *
 * Renders nothing when not listening, or when there's currently no
 * resolvable caret position (useCaretRect returns null) — never shows a
 * stale/wrong-position badge.
 */
export function VoiceListeningIndicator({ voice }) {
  const isActive = Boolean(voice?.isListening);
  const rect = useCaretRect(isActive);
  const badgeRef = useRef(null);
  // Only the horizontal axis is clamped — the badge sits right above the
  // caret (`translateY(-100%)`), which stays within the viewport in
  // practice since the caret itself must be visible to type into; the
  // centered horizontal offset is the one that can push it off-screen near
  // the left/right edge of a narrow viewport.
  const centerLeft = useAutoAdjustedCenteredLeft(badgeRef, Boolean(isActive && rect), rect?.left);

  if (!isActive || !rect || centerLeft == null) return null;

  const isProcessing = voice.status === 'processing';

  return createPortal(
    <div
      ref={badgeRef}
      className={`be-voice-indicator${isProcessing ? ' be-voice-indicator-processing' : ''}`}
      contentEditable={false}
      style={{ position: 'fixed', top: rect.top - 8, left: centerLeft, transform: 'translate(-50%, -100%)' }}
    >
      <span className="be-voice-indicator-dot" />
      <MicIcon size={12} />
      <span className="be-voice-indicator-label">{isProcessing ? 'Processing…' : 'Listening…'}</span>
    </div>,
    document.body,
  );
}
