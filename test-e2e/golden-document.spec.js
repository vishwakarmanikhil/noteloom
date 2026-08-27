import { test, expect } from '@playwright/test';

/**
 * Golden-document regression gate (see docs/repackaging-plan.md §8).
 *
 * Renders a deterministic document (test-e2e/fixtures/golden/) that exercises
 * every built-in block type and the atomic inline types, through the simple
 * public path (useEditor + NoteloomEditor), then snapshots the output of every
 * public serialization function. The repackaging phases move files and add
 * entry points but must not change what the editor renders or exports — a diff
 * in one of these snapshots is the signal that something regressed, without
 * anyone having to click through the editor by hand.
 *
 * Update snapshots deliberately, in the same commit as an intended change:
 *   npx playwright test golden-document --update-snapshots
 */

const GOLDEN_URL = 'http://localhost:5191/';

async function exports(page) {
  return page.evaluate(() => ({
    json: window.__noteloom.json(),
    simpleJson: window.__noteloom.simpleJson(),
    html: window.__noteloom.html(),
    markdown: window.__noteloom.markdown(),
    text: window.__noteloom.text(),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto(GOLDEN_URL);
  await page.waitForFunction(() => window.__noteloomReady === true);
  await page.waitForSelector('[data-run-id="rH1"]');
});

test('every built-in block renders (DOM structure is stable)', async ({ page }) => {
  const surface = page.locator('[role="document"]');
  const html = await surface.evaluate((el) => el.innerHTML);
  // Strip volatile bits: nothing in this fixture has random ids, but React
  // dev attributes / inline style rounding can wobble — keep the snapshot to
  // the structural shell.
  const normalized = html
    .replace(/\s+data-reactroot="[^"]*"/g, '')
    .replace(/style="[^"]*"/g, 'style=""');
  expect(normalized).toMatchSnapshot('golden-dom.html');
});

test('exportDocumentJSON output is stable', async ({ page }) => {
  const { json } = await exports(page);
  expect(prettyJson(json)).toMatchSnapshot('golden.json');
});

test('exportDocumentSimpleJSON output is stable', async ({ page }) => {
  const { simpleJson } = await exports(page);
  expect(JSON.stringify(simpleJson, null, 2)).toMatchSnapshot('golden.simple.json');
});

test('exportDocumentHTML output is stable', async ({ page }) => {
  const { html } = await exports(page);
  expect(html).toMatchSnapshot('golden.html');
});

test('exportDocumentMarkdown output is stable', async ({ page }) => {
  const { markdown } = await exports(page);
  expect(markdown).toMatchSnapshot('golden.md');
});

test('exportDocumentText output is stable', async ({ page }) => {
  const { text } = await exports(page);
  expect(text).toMatchSnapshot('golden.txt');
});

test('typing then undo returns the document to the golden baseline', async ({ page }) => {
  const baseline = (await exports(page)).json;

  const run = page.locator('[data-run-id="rPlain"]');
  await run.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' EDIT');

  const afterEdit = (await exports(page)).json;
  expect(afterEdit).not.toBe(baseline);
  expect(afterEdit).toContain('EDIT');

  // Undo granularity (per-keystroke vs per-burst) is an engine detail with its
  // own unit tests — here we only assert the edit is fully reversible, so
  // press undo until it settles rather than assuming a single step.
  for (let i = 0; i < 12 && (await exports(page)).json !== baseline; i++) {
    await page.keyboard.press('Control+z');
  }
  expect((await exports(page)).json).toBe(baseline);
});

function prettyJson(jsonString) {
  return JSON.stringify(JSON.parse(jsonString), null, 2);
}
