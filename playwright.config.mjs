/* صلة — Playwright: one command (npm test) runs every check, on a desktop and a phone viewport,
   against the site served from a sub-path like GitHub Pages does. */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:' + PORT + '/sila/',
    reducedMotion: 'reduce',                      // the pages shorten their pauses; the demo-film tests switch motion back on
    trace: 'retain-on-failure'
  },
  webServer: { command: 'node tests/serve.mjs ' + PORT, url: 'http://127.0.0.1:' + PORT + '/sila/', reuseExistingServer: true, timeout: 20000 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 820 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }
  ]
});
