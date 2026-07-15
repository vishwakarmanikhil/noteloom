import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

function printBlock() {
  const match = css.match(/@media print \{[\s\S]*?\n\}/);
  return match ? match[0] : '';
}

describe('style.css: @media print', () => {
  it('defines exactly one @media print block', () => {
    const matches = css.match(/@media print/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('hides every piece of editing-only chrome, including the block gutter, all portaled menus, and the floating toolbar', () => {
    const block = printBlock();
    const mustHide = [
      '.be-block-gutter',
      '.be-block-gutter-menu',
      '.be-block-range-menu',
      '.be-slash-menu',
      '.be-floating-toolbar',
      '.be-link-hover-card',
      '.be-table-header-menu-trigger',
      '.be-table-col-resize-handle',
      '.be-embed-toolbar',
      '.be-embed-resize-handle',
      '.be-modal-overlay',
      '.be-mobile-action-bar',
      '.be-export-trigger',
      '.be-select-popover',
    ];
    for (const selector of mustHide) {
      expect(block, `expected ${selector} to be hidden in @media print`).toContain(selector);
    }
  });

  it('hides .be-block-row-hidden so printing always respects "Hide in preview", even outside preview mode', () => {
    expect(printBlock()).toContain('.be-block-row-hidden');
  });

  it('does NOT hide .be-block-row-range-selected or .be-block-selected outright — those mark real content, not standalone chrome', () => {
    const block = printBlock();
    // Must appear (to reset their highlight styling)...
    expect(block).toContain('.be-block-row-range-selected');
    expect(block).toContain('.be-block-selected');
    // ...but the selector list feeding the `display: none !important` rule
    // must not include either — that rule blanks out its selectors
    // entirely, which would delete real block content, not just chrome.
    const hideRuleSelectors = block.slice(0, block.indexOf('display: none'));
    expect(hideRuleSelectors).not.toContain('.be-block-row-range-selected');
    expect(hideRuleSelectors).not.toMatch(/\.be-block-selected[,\s]/);
  });
});
