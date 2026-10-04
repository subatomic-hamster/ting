// End-to-end tests against the deployed app (infra/outputs.json → WebUrl), on desktop Chrome and on an emulated
// iPhone in WebKit (Safari's engine). Run: npx playwright test   (E2E_BASE_URL overrides the target)
import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const outputs = JSON.parse(readFileSync(new URL('./infra/outputs.json', import.meta.url), 'utf8')) as { Ting: { WebUrl: string } };

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'local/**',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? outputs.Ting.WebUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 15'] } },
  ],
});
