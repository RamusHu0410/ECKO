import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests (npm test): the real page in headless Chrome, with Chrome's fake microphone
 * (it plays a steady beep) and the backend replaced by fixed replies inside each test.
 * Uses the installed Google Chrome; without it, run `npx playwright install chromium` and
 * remove `channel`.
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5198',
    // every test starts as a returning visitor, so the guided tour doesn't cover the page
    // (tests/tour.spec.ts clears this to test the tour itself)
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5198', localStorage: [{ name: 'ecko:tour', value: 'done' }] }] },
    channel: 'chrome',
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  // its own dev server on its own port, so it never disturbs the one you work with
  webServer: { command: 'npx vite --port 5198 --strictPort', url: 'http://localhost:5198', reuseExistingServer: true },
})
