import { test, expect } from '@playwright/test';

/**
 * Real-browser coverage for the comments feature (see playwright.config.js
 * for why this exists alongside the much larger vitest suite). Runs
 * against examples/06-comments/, which wires `commentAuthorId` +
 * `showCommentsPanel` on <NoteloomEditor> -- the fully built-in experience.
 */

async function selectWord(page, runSelector, start, end) {
  await page.evaluate(
    ({ sel, start, end }) => {
      const el = document.querySelector(sel);
      const range = document.createRange();
      range.setStart(el.firstChild, start);
      range.setEnd(el.firstChild, end);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },
    { sel: runSelector, start, end },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-run-id="r1"]');
});

test('selecting text shows the floating toolbar with a Comment button', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6); // "Select"
  await expect(page.locator('.be-floating-toolbar')).toBeVisible();
  await expect(page.locator('.be-floating-toolbar-btn[title^="Comment"]')).toBeVisible();
});

test('Comment button opens a composer, replacing the button row, and highlights the text immediately', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');

  await expect(page.locator('.be-floating-toolbar-comment-standalone')).toBeVisible();
  await expect(page.locator('.be-floating-toolbar-btn[title^="Bold"]')).toHaveCount(0);
  await expect(page.locator('.be-comment-highlight')).toBeVisible();
});

test('submitting a comment: appears in the panel, and the plain toolbar does not pop back up behind it', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');
  await page.fill('.be-comment-composer-textarea', 'How does this hold up long-term?');
  await page.click('.be-comment-composer-submit');

  await expect(page.locator('.be-comments-panel-item')).toContainText('How does this hold up long-term?');
  await expect(page.locator('.be-floating-toolbar-btn[title^="Bold"]')).toHaveCount(0);
});

test('Cancel strips the just-applied highlight and creates no thread', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');
  await expect(page.locator('.be-comment-highlight')).toBeVisible();

  await page.click('.be-comment-composer-cancel');

  await expect(page.locator('.be-comment-highlight')).toHaveCount(0);
  await expect(page.locator('.be-comments-panel-item')).toHaveCount(0);
});

test('Ctrl+Alt+M opens the composer the same way the button does', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.keyboard.press('Control+Alt+KeyM');
  await expect(page.locator('.be-comment-composer-textarea')).toBeVisible();
});

test('clicking a highlighted comment opens a popover with Reply/Resolve/Delete', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');
  await page.fill('.be-comment-composer-textarea', 'first message');
  await page.click('.be-comment-composer-submit');

  await page.click('.be-comment-highlight');
  const popover = page.locator('.be-comment-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('first message');
  await expect(popover.getByText('Reply')).toBeVisible();
  await expect(popover.getByText('Resolve')).toBeVisible();
});

test('replying from the popover shows up in the panel too', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');
  await page.fill('.be-comment-composer-textarea', 'first message');
  await page.click('.be-comment-composer-submit');

  await page.click('.be-comment-highlight');
  await page.locator('.be-comment-popover').getByText('Reply').click();
  await page.fill('.be-comment-popover .be-comment-composer-textarea', 'a reply');
  await page.click('.be-comment-popover .be-comment-composer-submit');

  await expect(page.locator('.be-comments-panel-item')).toContainText('a reply');
});

test('Resolve then Delete from the panel removes the thread and its highlight', async ({ page }) => {
  await selectWord(page, '[data-run-id="r1"]', 0, 6);
  await page.click('.be-floating-toolbar-btn[title^="Comment"]');
  await page.fill('.be-comment-composer-textarea', 'needs a look');
  await page.click('.be-comment-composer-submit');

  await page.locator('.be-comments-panel-item').getByText('Resolve').click();
  await expect(page.locator('.be-comments-panel-item').getByText('Reopen')).toBeVisible();

  await page.locator('.be-comments-panel-item .be-comment-thread-delete').click();
  await expect(page.locator('.be-comments-panel-item')).toHaveCount(0);
  await expect(page.locator('.be-comment-highlight')).toHaveCount(0);
});

test('the panel renders nothing at all when there are no comments', async ({ page }) => {
  await expect(page.locator('.be-comments-panel')).toHaveCount(0);
});
