import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'bin', 'noteloom.mjs');

describe('bin/noteloom.mjs', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'noteloom-cli-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args) {
    return execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  }
  // Returns the failing process's stderr (execFileSync throws on non-zero exit).
  function runExpectingFailure(args) {
    try {
      run(args);
    } catch (err) {
      return String(err.stderr ?? '');
    }
    throw new Error('expected the CLI to exit non-zero');
  }

  it('scaffolds a block into <name>/ with a defineBlock() index', () => {
    const out = run(['new', 'block', 'widget']);
    expect(out).toContain('created widget/index.js');
    expect(existsSync(join(dir, 'widget/index.js'))).toBe(true);
    expect(existsSync(join(dir, 'widget/WidgetBlock.jsx'))).toBe(true);
    expect(existsSync(join(dir, 'widget/widget.test.js'))).toBe(true);
    const index = readFileSync(join(dir, 'widget/index.js'), 'utf8');
    expect(index).toMatch(/defineBlock\(\{/);
    expect(index).toMatch(/name: 'widget'/);
  });

  it('scaffolds an inline type', () => {
    run(['new', 'inline', 'chip']);
    const index = readFileSync(join(dir, 'chip/index.js'), 'utf8');
    expect(index).toMatch(/defineInline\(\{/);
    expect(index).toMatch(/name: 'chip'/);
  });

  it('rejects a bad name', () => {
    expect(runExpectingFailure(['new', 'block', 'Bad-Name'])).toMatch(/must start lowercase/);
  });

  it('rejects an existing directory', () => {
    run(['new', 'block', 'ok']);
    expect(runExpectingFailure(['new', 'block', 'ok'])).toMatch(/already exists/);
  });

  it('prints help with no args', () => {
    expect(run([])).toContain('Usage:');
  });
});
