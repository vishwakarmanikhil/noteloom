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
 * Points at examples/06-comments/ (the dedicated comments demo, already
 * wired with commentAuthorId + showCommentsPanel) on a fixed port so it
 * doesn't collide with `npm run dev`/other example servers a developer
 * might already have running on 5173.
 */
export default defineConfig({
  testDir: './test-e2e',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --config examples/06-comments/vite.config.js --port 5190 --strictPort',
    port: 5190,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
