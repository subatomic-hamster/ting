import { test, expect } from '@playwright/test';
import { registerPlanFlows } from '../planFlows';

let externalRequests: string[] = [];
// No internet, AWS credentials, remote fonts or OCR CDN may be needed by these flows.
test.beforeEach(async ({ context, baseURL }) => {
  externalRequests = [];
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    externalRequests.push(url);
    return route.abort('blockedbyclient');
  });
});

test.afterEach(() => expect(externalRequests).toEqual([]));

registerPlanFlows();

test('container health, worker MIME and direct client routes', async ({ page, request }) => {
  expect((await request.get('/healthz')).status()).toBe(200);
  expect((await request.get('/assets/missing.mjs')).status()).toBe(404);
  await page.goto('/treatment');
  await expect(page.getByRole('heading', { name: 'Your treatment', exact: true })).toBeVisible();
  const config = await request.get('/config.js');
  expect(await config.text()).toContain('"useMocks":true');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your treatment', exact: true })).toBeVisible();
});
