import { test, expect } from '@playwright/test';

/**
 * Real-browser coverage for `<NoteloomEditor voice={...}>` actually wiring
 * up end to end in a real environment: `useVoiceTyping({ store })` reads
 * `window.SpeechRecognition`/`webkitSpeechRecognition` (real Chromium
 * implements the latter; jsdom implements neither), and the mic button
 * genuinely appears in the floating toolbar and toggles the real
 * recognition object's state.
 *
 * Deliberately does NOT attempt to test the mic-PERMISSION-denied path
 * here: this environment's automated Chromium starts real speech
 * recognition regardless of the actual OS/browser permission state (tried
 * both leaving it unset and explicitly denying it via
 * `Browser.setPermission` over CDP — `onstart` still fires either way,
 * evidently because headless/automated Chromium stubs the underlying audio
 * capture rather than genuinely gating it the way a real user's browser
 * does), so there is no reliable way to provoke `onerror('not-allowed')`
 * from here. That state-transition logic (`permissionState` ->
 * `VoicePermissionModal`) is already covered deterministically at the unit
 * level instead, via a mocked `engine` — see
 * test/react/useVoiceTyping.test.jsx and test/react/VoicePermissionModal.test.jsx.
 *
 * Runs against test-e2e/fixtures/voice/ (see playwright.config.js) -- no
 * example app wires NoteloomEditor's `voice` prop yet, hence its own fixture.
 */

const VOICE_URL = 'http://localhost:5193/';

test.beforeEach(async ({ page }) => {
  await page.goto(VOICE_URL);
  await page.waitForSelector('[data-run-id]');
});

async function selectAllText(page, runSelector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, runSelector);
}

test('the mic button appears in the floating toolbar (real Chromium implements webkitSpeechRecognition)', async ({
  page,
}) => {
  await selectAllText(page, '[data-run-id]');
  const micBtn = page.locator('.be-floating-toolbar-btn[aria-label="Start dictation"]');
  await expect(micBtn).toBeVisible();

  // Starting a real recognition session flips the button to "Pause
  // dictation" -- proof the `voice` prop threaded all the way from
  // useVoiceTyping({ store: editor.store }) into FloatingToolbar actually
  // drives a real, live SpeechRecognition instance, not just a static prop.
  await micBtn.click();
  await expect(page.locator('.be-floating-toolbar-btn[aria-label="Pause dictation"]')).toBeVisible();

  await page.locator('.be-floating-toolbar-btn[aria-label="Pause dictation"]').click();
  await expect(page.locator('.be-floating-toolbar-btn[aria-label="Start dictation"]')).toBeVisible();
});
