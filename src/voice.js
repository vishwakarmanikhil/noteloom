// noteloom/voice — continuous dictation + spoken structural commands, built on
// the browser's own SpeechRecognition (no SDK bundled). Opt-in entry point;
// also still re-exported from the main `noteloom` entry for backward
// compatibility (removed in 2.0 — see docs/repackaging-plan.md).

export { useVoiceTyping } from './react/useVoiceTyping.js';
export { VoicePermissionModal } from './react/VoicePermissionModal.jsx';
export { VoiceListeningIndicator } from './react/VoiceListeningIndicator.jsx';
export { listVoiceCommands } from './voice/voiceCommands.js';
