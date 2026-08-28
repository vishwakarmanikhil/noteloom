import { describe, it, expect } from 'vitest';
import {
  defineBlock,
  defineInline,
  isBlockDefinition,
  isInlineDefinition,
  registerExtensions,
} from '../../src/registry/define.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { starterKit } from '../../src/starter-kit.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';

const Comp = () => null;

describe('defineBlock', () => {
  it('tags the result and resolves isLeaf from contentModel', () => {
    expect(defineBlock({ name: 'a', component: Comp }).isLeaf).toBe(false); // default 'blocks'
    expect(defineBlock({ name: 'a', component: Comp, contentModel: 'blocks' }).isLeaf).toBe(false);
    expect(defineBlock({ name: 'a', component: Comp, contentModel: 'runs' }).isLeaf).toBe(true);
    expect(defineBlock({ name: 'a', component: Comp, contentModel: 'void' }).isLeaf).toBe(true);

    const def = defineBlock({ name: 'a', component: Comp, contentModel: 'runs' });
    expect(def.kind).toBe('block');
    expect(def.name).toBe('a');
    expect(isBlockDefinition(def)).toBe(true);
    expect(isInlineDefinition(def)).toBe(false);
  });

  it('honours an explicit isLeaf over contentModel (wrapping a pre-existing entry)', () => {
    expect(defineBlock({ name: 'a', component: Comp, isLeaf: true }).isLeaf).toBe(true);
  });

  it('passes unknown entry fields through untouched', () => {
    const toHTML = () => '<p></p>';
    const slashCommand = { label: 'A', run() {} };
    const def = defineBlock({
      name: 'a',
      component: Comp,
      defaultProps: { x: 1 },
      toHTML,
      slashCommand,
    });
    expect(def.toHTML).toBe(toHTML);
    expect(def.slashCommand).toBe(slashCommand);
    expect(def.defaultProps).toEqual({ x: 1 });
  });

  it('throws on bad input', () => {
    expect(() => defineBlock()).toThrow(/config must be an object/);
    expect(() => defineBlock({ component: Comp })).toThrow(/`name` must be a non-empty string/);
    expect(() => defineBlock({ name: 'a' })).toThrow(/`component` must be a React component/);
    expect(() => defineBlock({ name: 'a', component: Comp, contentModel: 'nope' })).toThrow(
      /`contentModel` must be/,
    );
  });
});

describe('defineInline', () => {
  it('tags the result and forces isAtomic true', () => {
    const def = defineInline({ name: 'chip', component: Comp });
    expect(def.kind).toBe('inline');
    expect(def.isAtomic).toBe(true);
    expect(isInlineDefinition(def)).toBe(true);
  });

  it('throws on a non-atomic request or missing component', () => {
    expect(() => defineInline({ name: 'chip' })).toThrow(/`component` must be a React component/);
    expect(() => defineInline({ name: 'chip', component: Comp, atomic: false })).toThrow(
      /only atomic inline types/,
    );
  });
});

describe('registerExtensions', () => {
  it('routes block and inline definitions to the right registry, flattening nesting', () => {
    const registry = createBlockRegistry();
    const inlineRegistry = createInlineRegistry();
    const block = defineBlock({ name: 'b', component: Comp });
    const inline = defineInline({ name: 'i', component: Comp });

    registerExtensions([block, [inline]], { registry, inlineRegistry });

    expect(registry.get('b')).toBe(block);
    expect(inlineRegistry.get('i')).toBe(inline);
  });

  it('throws on a plain object that is not a definition', () => {
    expect(() => registerExtensions([{ name: 'x' }], { registry: createBlockRegistry() })).toThrow(
      /must be a defineBlock\(\) or defineInline\(\) result/,
    );
  });
});

describe('starterKit()', () => {
  it('registers the exact same set as registerBuiltInBlocks / registerBuiltInInlineTypes', () => {
    const builtinB = createBlockRegistry();
    const builtinI = createInlineRegistry();
    registerBuiltInBlocks(builtinB);
    registerBuiltInInlineTypes(builtinI);

    const kitB = createBlockRegistry();
    const kitI = createInlineRegistry();
    registerExtensions(starterKit(), { registry: kitB, inlineRegistry: kitI });

    const blockKeys = (r) => [...r._types.keys()].sort();
    expect(blockKeys(kitB)).toEqual(blockKeys(builtinB));
    expect(blockKeys(kitI)).toEqual(blockKeys(builtinI));

    for (const key of blockKeys(builtinB)) {
      const a = builtinB.get(key);
      const b = kitB.get(key);
      expect(b.component).toBe(a.component);
      expect(b.isLeaf).toBe(a.isLeaf);
      expect(b.toHTML).toBe(a.toHTML);
      expect(b.slashCommand).toBe(a.slashCommand);
      expect(b.slashCommands).toBe(a.slashCommands);
    }
  });

  it('exclude drops a type by name', () => {
    const names = starterKit({ exclude: ['canvas', 'emoji'] }).map((e) => e.name);
    expect(names).not.toContain('canvas');
    expect(names).not.toContain('emoji');
    expect(names).toContain('paragraph');
  });
});
