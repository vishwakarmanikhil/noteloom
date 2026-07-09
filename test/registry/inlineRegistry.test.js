import { describe, it, expect } from 'vitest';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';

describe('InlineRegistry.listSlashCommands', () => {
  it('includes a type\'s singular slashCommand', () => {
    const registry = createInlineRegistry();
    registry.register('date', { slashCommand: { label: 'Date', keywords: [], run: () => {} } });

    expect(registry.listSlashCommands().map((c) => c.label)).toEqual(['Date']);
  });

  it('includes every entry in a type\'s plural slashCommands array (regression: emoji needs many commands from one type)', () => {
    const registry = createInlineRegistry();
    registry.register('emoji', {
      slashCommands: [
        { label: '🔥 fire', keywords: ['emoji'], run: () => {} },
        { label: '😀 grin', keywords: ['emoji'], run: () => {} },
      ],
    });

    expect(registry.listSlashCommands().map((c) => c.label)).toEqual(['🔥 fire', '😀 grin']);
  });

  it('combines singular and plural across multiple registered types', () => {
    const registry = createInlineRegistry();
    registry.register('date', { slashCommand: { label: 'Date', keywords: [], run: () => {} } });
    registry.register('emoji', {
      slashCommands: [{ label: '🔥 fire', keywords: ['emoji'], run: () => {} }],
    });

    expect(registry.listSlashCommands().map((c) => c.label)).toEqual(['Date', '🔥 fire']);
  });

  it('a type contributing neither is simply skipped', () => {
    const registry = createInlineRegistry();
    registry.register('select', { component: () => null });
    expect(registry.listSlashCommands()).toEqual([]);
  });
});

describe('InlineRegistry.listAtCommands', () => {
  it('includes a type\'s singular atCommand, independent of slashCommand', () => {
    const registry = createInlineRegistry();
    registry.register('assignee', {
      slashCommand: { label: 'Assignee (slash)', keywords: [], run: () => {} },
      atCommand: { label: 'Assignee', keywords: [], run: () => {} },
    });

    expect(registry.listAtCommands().map((c) => c.label)).toEqual(['Assignee']);
    expect(registry.listSlashCommands().map((c) => c.label)).toEqual(['Assignee (slash)']);
  });

  it('includes every entry in a type\'s plural atCommands array', () => {
    const registry = createInlineRegistry();
    registry.register('assignee', {
      atCommands: [
        { label: 'Alex', keywords: [], run: () => {} },
        { label: 'Bailey', keywords: [], run: () => {} },
      ],
    });

    expect(registry.listAtCommands().map((c) => c.label)).toEqual(['Alex', 'Bailey']);
  });

  it('a type contributing neither atCommand nor atCommands is simply skipped', () => {
    const registry = createInlineRegistry();
    registry.register('date', { slashCommand: { label: 'Date', keywords: [], run: () => {} } });
    expect(registry.listAtCommands()).toEqual([]);
  });
});
