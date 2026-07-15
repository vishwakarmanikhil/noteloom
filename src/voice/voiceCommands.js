/**
 * The spoken-phrase -> editor-action table driving voice typing (see
 * useVoiceTyping.js). Deliberately data-driven and pure (no store/DOM
 * access here at all) so the "does this phrase count as a command"
 * decision is directly unit-testable without a real SpeechRecognition
 * engine — matchVoiceCommand is exercised with plain strings.
 *
 * Only a *complete, isolated* recognized utterance is ever checked against
 * this table (see useVoiceTyping's isFinal handling) — a command phrase
 * spoken as part of a longer sentence while dictating never matches,
 * since the caller only calls this with one finalized speech segment at a
 * time, normalized as its own whole utterance.
 *
 * Each entry's `description` is shown to end users (see listVoiceCommands)
 * — not just a code comment — so keep it short and phrased as what saying
 * it does, not how it's implemented.
 */
const COMMANDS = [
  {
    phrases: ['new paragraph', 'next paragraph'],
    description: 'Start a new paragraph',
    action: { type: 'insertParagraph' },
  },
  {
    phrases: ['heading one', 'heading 1'],
    description: 'Convert the current block to a heading 1',
    action: { type: 'convertBlock', blockType: 'heading', props: { level: 1 } },
  },
  {
    phrases: ['heading two', 'heading 2'],
    description: 'Convert the current block to a heading 2',
    action: { type: 'convertBlock', blockType: 'heading', props: { level: 2 } },
  },
  {
    phrases: ['heading three', 'heading 3'],
    description: 'Convert the current block to a heading 3',
    action: { type: 'convertBlock', blockType: 'heading', props: { level: 3 } },
  },
  {
    phrases: ['bulleted list', 'bullet point', 'bullet list'],
    description: 'Convert the current block to a bulleted list item',
    action: { type: 'convertBlock', blockType: 'listItem', props: { ordered: false, titleRunIds: [] } },
  },
  {
    phrases: ['numbered list', 'ordered list'],
    description: 'Convert the current block to a numbered list item',
    action: { type: 'convertBlock', blockType: 'listItem', props: { ordered: true, titleRunIds: [] } },
  },
  {
    phrases: ['checklist', 'to-do', 'to do', 'to-do list', 'to do list'],
    description: 'Convert the current block to a to-do item',
    action: {
      type: 'convertBlock',
      blockType: 'listItem',
      props: { ordered: false, checked: false, titleRunIds: [] },
    },
  },
  {
    phrases: ['quote'],
    description: 'Convert the current block to a quote',
    action: { type: 'convertBlock', blockType: 'blockquote', props: {} },
  },
  {
    phrases: ['code block', 'code'],
    description: 'Convert the current block to a code block',
    action: { type: 'convertBlock', blockType: 'code', props: { language: 'plaintext' } },
  },
  { phrases: ['undo'], description: 'Undo the last edit', action: { type: 'undo' } },
  { phrases: ['redo'], description: 'Redo the last undone edit', action: { type: 'redo' } },
  {
    phrases: ['stop dictation', 'stop listening', 'stop'],
    description: 'Stop dictation',
    action: { type: 'stopDictation' },
  },
];

const PHRASE_TO_ACTION = new Map();
for (const { phrases, action } of COMMANDS) {
  for (const phrase of phrases) PHRASE_TO_ACTION.set(phrase, action);
}

/**
 * Lowercases, trims, collapses internal whitespace, and strips trailing
 * sentence punctuation a speech engine commonly appends to a finalized
 * utterance (".", ",", "!", "?") — none of that punctuation is meaningful
 * for matching a short command phrase.
 */
export function normalizeUtterance(text) {
  return (text ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?]+$/, '');
}

/**
 * Returns the matching command action for a normalized, complete utterance,
 * or null if it's plain dictation (no command matched). Exact-match only —
 * deliberately not a substring/contains check, so a sentence that merely
 * *mentions* a command phrase while dictating prose is never misread as a
 * command (matches only when the whole finalized utterance IS the phrase).
 */
export function matchVoiceCommand(text) {
  return PHRASE_TO_ACTION.get(normalizeUtterance(text)) ?? null;
}

/**
 * Read-only `[{ phrases, description }]` list for a host to render as an
 * in-app "what can I say" help list — pure data, no rendering opinion (see
 * examples/basic's own "Voice commands" button for one way to display it).
 */
export function listVoiceCommands() {
  return COMMANDS.map(({ phrases, description }) => ({ phrases: [...phrases], description }));
}
