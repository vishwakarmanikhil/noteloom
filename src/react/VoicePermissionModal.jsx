import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';

/**
 * Ready-made "microphone access is blocked" dialog for useVoiceTyping —
 * mount it once anywhere alongside a mic button: `<VoicePermissionModal
 * voice={voice} />`. Driven by `voice.permissionState`, so there's no
 * separate isOpen prop to wire — it opens itself the instant permission is
 * detected as denied (whether that's from a failed start() attempt or the
 * opportunistic Permissions API check useVoiceTyping does on mount).
 *
 * Manually dismissible (Escape/backdrop click, via Modal's own built-in
 * handling) rather than forced to stay open until permission is fixed —
 * `dismissed` tracks that locally and resets the instant a *new* denial
 * comes in (voice.error changing is what "a new denial just happened"
 * means here, since start() always clears error first) so the dialog
 * reappears on the next real attempt even after being dismissed once,
 * rather than staying silently suppressed forever.
 */
export function VoicePermissionModal({ voice }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [voice?.error]);

  const isOpen = voice?.permissionState === 'denied' && !dismissed;

  return (
    <Modal isOpen={isOpen} onClose={() => setDismissed(true)} title="Microphone access blocked">
      <p>{voice?.error || 'Microphone access is blocked. Enable it in your browser\'s site settings, then try again.'}</p>
      <div className="be-modal-actions">
        <button type="button" className="be-modal-cancel" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
        <button type="button" className="be-modal-save" onClick={() => voice?.start?.()}>
          Try again
        </button>
      </div>
    </Modal>
  );
}
