import { describe, it, expect } from 'vitest';
import { normalizeUtterance, matchVoiceCommand, listVoiceCommands } from '../../src/voice/voiceCommands.js';

describe('normalizeUtterance', () => {
  it('lowercases, trims, collapses whitespace, and strips trailing punctuation', () => {
    expect(normalizeUtterance('  Heading One.  ')).toBe('heading one');
    expect(normalizeUtterance('New   Paragraph!')).toBe('new paragraph');
    expect(normalizeUtterance('Undo?')).toBe('undo');
  });

  it('returns an empty string for null/undefined', () => {
    expect(normalizeUtterance(null)).toBe('');
    expect(normalizeUtterance(undefined)).toBe('');
  });
});

describe('matchVoiceCommand', () => {
  it('matches "new paragraph" and "next paragraph" to the same insertParagraph action', () => {
    expect(matchVoiceCommand('new paragraph')).toEqual({ type: 'insertParagraph' });
    expect(matchVoiceCommand('Next Paragraph.')).toEqual({ type: 'insertParagraph' });
  });

  it('matches heading level phrases, including digit and spelled-out forms', () => {
    expect(matchVoiceCommand('heading one')).toEqual({ type: 'convertBlock', blockType: 'heading', props: { level: 1 } });
    expect(matchVoiceCommand('heading 2')).toEqual({ type: 'convertBlock', blockType: 'heading', props: { level: 2 } });
    expect(matchVoiceCommand('Heading Three')).toEqual({
      type: 'convertBlock',
      blockType: 'heading',
      props: { level: 3 },
    });
  });

  it('matches list/checklist/quote/code-block phrases', () => {
    expect(matchVoiceCommand('bullet point')).toEqual({
      type: 'convertBlock',
      blockType: 'listItem',
      props: { ordered: false, titleRunIds: [] },
    });
    expect(matchVoiceCommand('numbered list')).toEqual({
      type: 'convertBlock',
      blockType: 'listItem',
      props: { ordered: true, titleRunIds: [] },
    });
    expect(matchVoiceCommand('to-do')).toEqual({
      type: 'convertBlock',
      blockType: 'listItem',
      props: { ordered: false, checked: false, titleRunIds: [] },
    });
    expect(matchVoiceCommand('quote')).toEqual({ type: 'convertBlock', blockType: 'blockquote', props: {} });
    expect(matchVoiceCommand('code block')).toEqual({
      type: 'convertBlock',
      blockType: 'code',
      props: { language: 'plaintext' },
    });
  });

  it('matches undo/redo', () => {
    expect(matchVoiceCommand('undo')).toEqual({ type: 'undo' });
    expect(matchVoiceCommand('redo')).toEqual({ type: 'redo' });
  });

  it('matches stop-dictation phrases', () => {
    expect(matchVoiceCommand('stop dictation')).toEqual({ type: 'stopDictation' });
    expect(matchVoiceCommand('Stop Listening.')).toEqual({ type: 'stopDictation' });
    expect(matchVoiceCommand('stop')).toEqual({ type: 'stopDictation' });
  });

  it('returns null for plain dictated prose, even when it mentions a command phrase mid-sentence', () => {
    expect(matchVoiceCommand("that concludes the introduction paragraph")).toBeNull();
    expect(matchVoiceCommand('The results were significant.')).toBeNull();
    expect(matchVoiceCommand('')).toBeNull();
  });

  it('is an exact match, not a substring match — a phrase merely containing a command word does not match', () => {
    expect(matchVoiceCommand('undoubtedly true')).toBeNull();
    expect(matchVoiceCommand('a new paragraph starts here')).toBeNull();
    expect(matchVoiceCommand('please stop and think')).toBeNull();
  });
});

describe('listVoiceCommands', () => {
  it('returns every command with its phrases and a human-readable description', () => {
    const list = listVoiceCommands();
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(Array.isArray(entry.phrases)).toBe(true);
      expect(entry.phrases.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    }
    const stopEntry = list.find((entry) => entry.phrases.includes('stop dictation'));
    expect(stopEntry.description).toBe('Stop dictation');
  });

  it('returns a fresh copy each time — mutating the result cannot corrupt the internal table', () => {
    const list = listVoiceCommands();
    list[0].phrases.push('corrupted');
    expect(listVoiceCommands()[0].phrases).not.toContain('corrupted');
  });
});
