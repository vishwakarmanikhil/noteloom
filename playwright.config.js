import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser coverage for things jsdom (the vitest suite's own
 * environment) genuinely can't verify: actual Selection API behavior
 * (native text selection, selectionchange timing), real click/hover event
 * dispatch, and actual layout/positioning math (getBoundingClientRect on
 * real rendered elements). Deliberately small and flow-level (see
 * test-e2e/comments.spec.js) -- everything else (component logic, store
 * behavior, most UI states) is already covered far more cheaply by the
 * vitest suite (`npm test`), which should stay the first line of defense.
 *
 * Two fixtures, each on its own fixed port so they don't collide with
 * `npm run dev`/other example servers a developer might already have on 5173:
 *   - examples/06-comments/ (5190) — the comments flow (comments.spec.js).
 *   - test-e2e/fixtures/golden/ (5191) — the deterministic golden-document
 *     fixture whose serialized output is snapshotted (golden-document.spec.js),
 *     the cheap regression gate for the repackaging work in
 *     docs/repackaging-plan.md. Specs use absolute URLs, so there's no single
 *     shared baseURL.
 */
export default defineConfig({
  testDir: './test-e2e',
  // Golden-document snapshots are serializer output (JSON/HTML/Markdown/text)
  // and normalized DOM structure — deterministic across OS/arch — so drop the
  // default {platform}/{projectName} suffixes and commit one shared snapshot
  // set that CI (Linux) and local dev (any OS) both check against.
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    // comments.spec.js uses page.goto('/') against this; golden-document.spec.js
    // uses an absolute http://localhost:5191 URL instead.
    baseURL: 'http://localhost:5190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx vite --config examples/06-comments/vite.config.js --port 5190 --strictPort',
      port: 5190,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npx vite --config test-e2e/fixtures/golden/vite.config.js --port 5191 --strictPort',
      port: 5191,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
