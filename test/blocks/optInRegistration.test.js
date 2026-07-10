import { describe, it, expect } from 'vitest';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import {
  registerBlocks,
  registerBuiltInBlocks,
  paragraphBlockType,
  headingBlockType,
  buttonBlockType,
  TABLE_BLOCKS,
  LAYOUT_BLOCKS,
} from '../../src/blocks/index.js';
import { registerInlineTypes, registerBuiltInInlineTypes, selectInlineType, TABLE_SELECT_INLINE_TYPES } from '../../src/inlineTypes/index.js';

describe('registerBlocks: opt-in subset registration', () => {
  it('registers only the named types, nothing else', () => {
    const registry = createBlockRegistry();
    registerBlocks(registry, { paragraph: paragraphBlockType, heading: headingBlockType });

    expect(registry.get('paragraph')).toBe(paragraphBlockType);
    expect(registry.get('heading')).toBe(headingBlockType);
    expect(registry.get('button')).toBeUndefined();
    expect(registry.get('table')).toBeUndefined();
  });

  it('a composite group (TABLE_BLOCKS) registers table + its row/cell types together in one spread', () => {
    const registry = createBlockRegistry();
    registerBlocks(registry, { paragraph: paragraphBlockType, ...TABLE_BLOCKS });

    expect(registry.get('table')).toBeDefined();
    expect(registry.get('tableRow')).toBeDefined();
    expect(registry.get('tableCell')).toBeDefined();
    expect(registry.get('layout')).toBeUndefined();
  });

  it('LAYOUT_BLOCKS registers layout + layoutColumn together', () => {
    const registry = createBlockRegistry();
    registerBlocks(registry, LAYOUT_BLOCKS);

    expect(registry.get('layout')).toBeDefined();
    expect(registry.get('layoutColumn')).toBeDefined();
  });

  it('a slash menu built from an opt-in registry only lists the registered types', () => {
    const registry = createBlockRegistry();
    registerBlocks(registry, { paragraph: paragraphBlockType, button: buttonBlockType });

    const labels = registry.listSlashCommands().map((c) => c.label);
    expect(labels).toEqual(['Text', 'Button']);
    expect(labels).not.toContain('Table');
  });

  it('registerBuiltInBlocks is exactly registerBlocks with every built-in type included', () => {
    const full = createBlockRegistry();
    registerBuiltInBlocks(full);

    const viaOptIn = createBlockRegistry();
    registerBlocks(viaOptIn, {
      paragraph: paragraphBlockType,
      heading: headingBlockType,
      button: buttonBlockType,
      ...TABLE_BLOCKS,
      ...LAYOUT_BLOCKS,
    });

    expect(full.get('paragraph')).toBe(viaOptIn.get('paragraph'));
    expect(full.get('table')).toBe(viaOptIn.get('table'));
  });
});

describe('registerInlineTypes: opt-in subset registration', () => {
  it('registers only the named inline types', () => {
    const inlineRegistry = createInlineRegistry();
    registerInlineTypes(inlineRegistry, { select: selectInlineType });

    expect(inlineRegistry.get('select')).toBe(selectInlineType);
    expect(inlineRegistry.get('date')).toBeUndefined();
  });

  it('TABLE_SELECT_INLINE_TYPES is the group to pair with TABLE_BLOCKS when using the select column type', () => {
    const inlineRegistry = createInlineRegistry();
    registerInlineTypes(inlineRegistry, TABLE_SELECT_INLINE_TYPES);
    expect(inlineRegistry.get('tableSelect')).toBeDefined();
  });

  it('registerBuiltInInlineTypes is exactly registerInlineTypes with every built-in type included', () => {
    const full = createInlineRegistry();
    registerBuiltInInlineTypes(full);
    expect(full.get('select')).toBe(selectInlineType);
  });
});
