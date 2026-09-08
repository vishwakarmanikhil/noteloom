import { test, expect } from '@playwright/test';

/**
 * Real-browser coverage for a real, TRUSTED clipboard paste (Ctrl+V,
 * dispatched by the OS/browser itself, not a script) landing in a plain
 * `<input>` that lives inside the editor's own DOM subtree — the embed
 * block's URL field, in particular. A script-dispatched (`isTrusted: false`)
 * ClipboardEvent, which is all jsdom can ever produce, never triggers a
 * browser's own default paste-into-a-native-control behavior for security
 * reasons — the vitest suite's own equivalent test can only ever confirm
 * `defaultPrevented` stays `false` and hopes the browser does the rest. This
 * spec is what actually proves it does.
 *
 * Regression coverage for the bug fixed alongside this: `useClipboardHandlers`
 * used to hijack every paste bubbling up through the editor's own container,
 * including ones landing in a plain `<input>`/`<textarea>`, turning a paste
 * into the embed URL field into a brand-new paragraph inserted elsewhere in
 * the document instead of text in the field itself.
 *
 * Runs against examples/01-quickstart/ (see playwright.config.js) — a plain
 * useEditor()/<NoteloomEditor>, no bespoke fixture needed.
 */

const QUICKSTART_URL = 'http://localhost:5192/';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(QUICKSTART_URL);
  await page.waitForSelector('[data-run-id]', { state: 'attached' });
});

async function insertEmbedBlock(page) {
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
}

test('pasting real clipboard content into the embed block\'s URL field lands in the field, not as a stray new block', async ({
  page,
}) => {
  await insertEmbedBlock(page);
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/pasted.png'));

  const blockCountBefore = await page.locator('[data-block-id]').count();

  const urlInput = page.locator('.be-embed-url-input');
  await urlInput.click();
  await page.keyboard.press('Control+v');

  await expect(urlInput).toHaveValue('https://example.com/pasted.png');
  await expect(page.locator('[data-block-id]')).toHaveCount(blockCountBefore); // no side-effect insertion
});

test('committing the pasted URL still works normally afterward', async ({ page }) => {
  await insertEmbedBlock(page);
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/pasted.png'));

  const urlInput = page.locator('.be-embed-url-input');
  await urlInput.click();
  await page.keyboard.press('Control+v');
  await page.click('.be-embed-url-commit');

  await expect(page.locator('.be-embed-image')).toHaveAttribute('src', 'https://example.com/pasted.png');
});
