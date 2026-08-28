// noteloom/voice — continuous dictation + spoken structural commands, built on
// the browser's own SpeechRecognition (no SDK bundled). Opt-in entry point;
// the same names are also (deprecated) on the main `noteloom` entry, to be
// removed in a future major.

export { useVoiceTyping } from './react/useVoiceTyping.js';
export { VoicePermissionModal } from './react/VoicePermissionModal.jsx';
export { VoiceListeningIndicator } from './react/VoiceListeningIndicator.jsx';
export { listVoiceCommands } from './voice/voiceCommands.js';
