#!/usr/bin/env node
// noteloom CLI — tiny, zero-dependency scaffolder for a custom block or inline
// type. `npx noteloom new block <name>` / `npx noteloom new inline <name>`.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HELP = `noteloom — scaffold an extension

Usage:
  npx noteloom new block <name>     Create <name>/ with a defineBlock() type
  npx noteloom new inline <name>    Create <name>/ with a defineInline() type

<name> is the type name (lowercase, e.g. "callout", "mention"). Files are
written under ./<name>/ in the current directory.
`;

function pascal(name) {
  return name.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

function blockFiles(name) {
  const Comp = `${pascal(name)}Block`;
  return {
    [`${name}/index.js`]: `import { defineBlock } from 'noteloom';
import { ${Comp} } from './${Comp}.jsx';

export const ${name}Block = defineBlock({
  name: '${name}',
  component: ${Comp},
  // 'blocks' (holds child blocks) | 'runs' (holds text) | 'void' (neither)
  contentModel: 'void',
  defaultProps: {},
  toPlainText: (block) => '',
  toHTML: (block) => '<div data-type="${name}"></div>',
  slashCommand: {
    label: '${pascal(name)}',
    keywords: ['${name}'],
    run(store, { blockId, runId, sliceStart, sliceEnd }) {
      // erase the "/${name}" query, then insert your block after \`blockId\`.
      // See examples/02-custom-block for a full slashCommand.run().
    },
  },
});
`,
    [`${name}/${Comp}.jsx`]: `import { useBlock, useEditorStore, operations } from 'noteloom';

export function ${Comp}({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  if (!block) return null;

  return (
    <div data-block-id={id} contentEditable={false}>
      ${pascal(name)} block
    </div>
  );
}
`,
    [`${name}/${name}.test.js`]: `import { describe, it, expect } from 'vitest';
import { ${name}Block } from './index.js';

describe('${name}Block', () => {
  it('is a defineBlock() result', () => {
    expect(${name}Block.kind).toBe('block');
    expect(${name}Block.name).toBe('${name}');
  });
});
`,
  };
}

function inlineFiles(name) {
  const Comp = `${pascal(name)}Node`;
  return {
    [`${name}/index.js`]: `import { defineInline } from 'noteloom';
import { ${Comp} } from './${Comp}.jsx';

export const ${name}Inline = defineInline({
  name: '${name}',
  component: ${Comp},
  toPlainText: (run) => run.data?.label ?? '',
  toHTML: (run) => \`<span data-inline-type="${name}">\${run.data?.label ?? ''}</span>\`,
  slashCommand: {
    label: '${pascal(name)}',
    keywords: ['${name}'],
    run(store, { blockId, runId, sliceStart, sliceEnd }) {
      // see src/inlineTypes/shared/insertInlineRun.js usage in the built-ins
    },
  },
});
`,
    [`${name}/${Comp}.jsx`]: `import { useRun } from 'noteloom';

export function ${Comp}({ id }) {
  const run = useRun(id);
  if (!run) return null;
  return <span contentEditable={false}>{run.data?.label ?? '${name}'}</span>;
}
`,
    [`${name}/${name}.test.js`]: `import { describe, it, expect } from 'vitest';
import { ${name}Inline } from './index.js';

describe('${name}Inline', () => {
  it('is a defineInline() result', () => {
    expect(${name}Inline.kind).toBe('inline');
    expect(${name}Inline.isAtomic).toBe(true);
  });
});
`,
  };
}

const [, , cmd, kind, name] = process.argv;

if (cmd !== 'new' || !['block', 'inline'].includes(kind) || !name) {
  process.stdout.write(HELP);
  process.exit(cmd ? 1 : 0);
}

if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
  process.stderr.write(`error: <name> must start lowercase and be alphanumeric (got "${name}")\n`);
  process.exit(1);
}
if (existsSync(name)) {
  process.stderr.write(`error: ./${name}/ already exists\n`);
  process.exit(1);
}

const files = kind === 'block' ? blockFiles(name) : inlineFiles(name);
mkdirSync(name, { recursive: true });
for (const [rel, content] of Object.entries(files)) {
  const path = join(process.cwd(), rel);
  mkdirSync(join(process.cwd(), rel, '..'), { recursive: true });
  writeFileSync(path, content);
  process.stdout.write(`  created ${rel}\n`);
}
process.stdout.write(
  `\nRegister it:  useEditor({ extensions: [...starterKit(), ${name}${kind === 'block' ? 'Block' : 'Inline'}] })\n`,
);
