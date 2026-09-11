import { test, expect } from '@playwright/test';

/**
 * Real-browser coverage for the embed block's mouse-drag resize handle
 * against ACTUAL rendered layout — jsdom always returns an all-zero
 * `getBoundingClientRect()` unless a test manually stubs it (see
 * test/blocks/embed.test.jsx's own `stubRect()` helper), so the vitest
 * suite's equivalent tests can only ever prove the *math* is right given a
 * fabricated container/frame width, never that the real drag distance ->
 * real percentage computation lines up against what the browser actually
 * laid out.
 *
 * Runs against examples/01-quickstart/ (see playwright.config.js).
 */

const QUICKSTART_URL = 'http://localhost:5192/';

test.beforeEach(async ({ page }) => {
  await page.goto(QUICKSTART_URL);
  await page.waitForSelector('[data-run-id]', { state: 'attached' });
});

async function insertImageEmbedWithSrc(page, src) {
  // A brand-new empty paragraph's run is a zero-width span -- Playwright's
  // click geometry can't target it at all (not even with force), so focus
  // it and place a collapsed caret directly, the same way a real click
  // would land on genuinely empty content.
  await page.evaluate(() => {
    const el = document.querySelector('[data-run-id]');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.type('/image');
  await page.waitForSelector('.be-slash-menu-item');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.be-embed-url-input');
  await page.fill('.be-embed-url-input', src);
  await page.click('.be-embed-url-commit');
  await page.waitForSelector('.be-embed-resize-handle');
}

test('dragging the resize handle left shrinks the embed frame, based on real layout', async ({
  page,
}) => {
  await insertImageEmbedWithSrc(page, 'https://example.com/photo.jpg');

  const frame = page.locator('.be-embed-frame');
  const before = await frame.boundingBox();
  expect(before.width).toBeGreaterThan(0);

  const handle = page.locator('.be-embed-resize-handle');
  const handleBox = await handle.boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 150, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();

  const after = await frame.boundingBox();
  expect(after.width).toBeLessThan(before.width);

  // The drag committed to the store (not just a local preview left dangling) --
  // the width survives a reload's worth of re-render, checked here via the
  // slider's own aria-valuenow reflecting the same clamped percentage.
  const ariaNow = Number(await handle.getAttribute('aria-valuenow'));
  expect(ariaNow).toBeLessThan(100);
  expect(ariaNow).toBeGreaterThanOrEqual(20); // MIN_WIDTH
});

test('dragging past the left edge clamps at the minimum width instead of collapsing to nothing', async ({
  page,
}) => {
  await insertImageEmbedWithSrc(page, 'https://example.com/photo2.jpg');

  const handle = page.locator('.be-embed-resize-handle');
  const handleBox = await handle.boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 5000, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(handle).toHaveAttribute('aria-valuenow', '20');
});
