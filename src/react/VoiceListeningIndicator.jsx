import { createPortal } from 'react-dom';
import { useCaretRect } from './useCaretRect.js';
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

  if (!isActive || !rect) return null;

  const isProcessing = voice.status === 'processing';

  return createPortal(
    <div
      className={`be-voice-indicator${isProcessing ? ' be-voice-indicator-processing' : ''}`}
      contentEditable={false}
      style={{ position: 'fixed', top: rect.top - 8, left: rect.left, transform: 'translate(-50%, -100%)' }}
    >
      <span className="be-voice-indicator-dot" />
      <MicIcon size={12} />
      <span className="be-voice-indicator-label">{isProcessing ? 'Processing…' : 'Listening…'}</span>
    </div>,
    document.body,
  );
}
