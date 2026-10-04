import { expect, test } from '@playwright/test';
import { api, failOnPageErrors, idToken, resetDemo, signInAs } from './helpers';

test.beforeEach(async () => {
  await resetDemo('dale');
});

test('dashboard loads on the live API with engine numbers and no layout overflow', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/?demo=1');
  await expect(page.getByText('Hi Dale')).toBeVisible();
  await expect(page.getByText('live API')).toBeVisible();
  await expect(page.getByText(/Your annual maximum/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
  expect(errors()).toEqual([]);
});

test('moving the crown before Dec 31 re-prices the plan', async ({ page }) => {
  await page.goto('/treatment');
  const crown = page.getByRole('button', { name: /^Crown \(porcelain\) on #30, .*Use left and right arrows/ });
  await crown.focus();
  await crown.press('Shift+ArrowLeft'); // a month earlier: from January into December
  // The screen-reader announcement carries the engine's re-priced total: this year's max is used up, so it costs more.
  await expect(page.getByText(/moved to Dec \d+, \d{4}\. You pay \$[\d,.]+ in total \(\+\$[\d,.]+\)/).first()).toBeAttached();
});

test('a Lincoln claim arrives live, survives a reload, and an underpaid one drafts a message', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Fire mock claim' }).click();
  await expect(page.getByText('New EOB')).toBeVisible();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible(); // replayed from the server
  await page.getByRole('button', { name: 'Underpaid EOB' }).click();
  await expect(page.getByText(/EOB says you owe/)).toBeVisible();
  await page.getByRole('button', { name: 'Draft a message to Lincoln' }).click();
  await expect(page.getByText(/Hello Lincoln Member Services/)).toBeVisible();
});

test('typed intake in Spanish finds the crown on #19', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByPlaceholder(/Root canal on #19/).fill('me van a poner una corona en la muela de abajo izquierda, reemplazando la vieja');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  await expect(page.getByText(/Found 1 item/)).toBeVisible();
  // Winnow reads "reemplazando la vieja" with high confidence, so the engine may not need to ask.
  await expect(page.getByText(/Crown \(porcelain\) on #19/).first()).toBeVisible();
});

test('treatment-plan photo is read by Textract into five items', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByLabel('Upload a photo of your treatment plan').setInputFiles('public/samples/treatment-plan.png');
  await expect(page.getByText(/found 5 items/)).toBeVisible({ timeout: 30_000 });
});

test("a dentist's bill above the EOB is flagged", async ({ page }) => {
  await page.goto('/treatment?demo=1');
  await page.getByRole('button', { name: 'Fire mock claim' }).click();
  await page.waitForTimeout(3000);
  await page.getByLabel('Upload a photo of your treatment plan').setInputFiles('public/samples/invoice.png');
  const confirm = page.getByRole('button', { name: 'Yes, same visit' });
  const flag = page.getByText(/Your bill asks for \$412, but Lincoln's EOB says you owe \$200/);
  await expect(confirm.or(flag)).toBeVisible({ timeout: 30_000 });
  if (await confirm.isVisible()) await confirm.click();
  await expect(flag).toBeVisible();
});

test('explanations are verified, proved by Automated Reasoning, and switch to Spanish', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByRole('button', { name: /Root canal \(molar\) on #19/ }).first().click();
  await expect(page.getByText('Proved').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Verified').first()).toBeVisible();
  await page.getByRole('radio', { name: 'es' }).click();
  await expect(page.getByText(/\b(paga|pagas|usted|su plan|tu plan|el plan|dentista|seguro|deducible)\b/i).first()).toBeVisible({ timeout: 45_000 });
});

test('dentist map shows every practice on OpenStreetMap', async ({ page }) => {
  await page.goto('/dentists');
  const map = page.getByRole('region', { name: 'Map of nearby dentists' });
  await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(13); // 12 dentists + you
});

test('share link shows the same plan on another device', async ({ page, browser }) => {
  await page.goto('/treatment');
  await page.getByRole('button', { name: 'Share with my dentist' }).first().click();
  const link = page.locator('a[href*="/share/"]').first();
  await expect(link).toBeVisible();
  const url = await link.getAttribute('href');
  const other = await browser.newContext();
  const dentist = await other.newPage();
  await dentist.goto(url!);
  await expect(dentist.getByText(/This link expires/)).toBeVisible();
  await expect(dentist.getByText('Dale').first()).toBeVisible();
  await other.close();
});

test('works offline: the engine and intake answer in the browser', async ({ page, context, browserName }) => {
  await page.goto('/treatment');
  await expect(page.getByText(/What you'll pay/)).toBeVisible();
  // Let the service worker install and cache the shell.
  await page.waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration())?.active, null, { timeout: 15_000 });
  if (browserName !== 'webkit') {
    await page.reload(); // a returning visitor: the service worker now controls the page
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 });
  }
  await context.setOffline(true);
  await page.getByPlaceholder(/Root canal on #19/).fill('cleaning and x-rays');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  await expect(page.getByText(/Found 2 items/)).toBeVisible();
  // Playwright's WebKit can't reload through a service worker while emulating offline ("internal error");
  // real Safari can. The offline reload is checked in Chromium.
  if (browserName !== 'webkit') {
    await page.reload();
    await expect(page.getByText(/Your treatment/)).toBeVisible();
  }
  await context.setOffline(false);
});

test('member sign-in: consent screen, then the member record', async ({ page }) => {
  await api('/me/delete', { method: 'POST', body: '{}', token: await idToken('member') });
  await signInAs(page, 'member');
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Before you start' })).toBeVisible();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Member · Sign out/ })).toBeVisible();
});

test('a signed-in member shares with a fresh sign-in (step-up passes)', async ({ page }) => {
  await signInAs(page, 'member');
  await page.goto('/treatment');
  await page.getByRole('button', { name: 'Share with my dentist' }).first().click();
  await expect(page.locator('a[href*="/share/"]').first()).toBeVisible();
});

test('employer admin sees server aggregates; a member is refused', async ({ page }) => {
  expect((await api('/admin/insights', { token: await idToken('member') })).status).toBe(403);
  await signInAs(page, 'employer_admin');
  await page.goto('/admin');
  await expect(page.getByText('Employer insights')).toBeVisible();
  await expect(page.getByText(/Showing the public sample/)).toHaveCount(0);
  await expect(page.getByText(/2 groups hidden/)).toBeVisible();
});

test('Lincoln analyst approves submitted plan rules', async ({ page }) => {
  const plans = await (await api('/plans')).json();
  await api('/rules/submit', { method: 'POST', body: JSON.stringify({ rules: plans[0], evidence: {}, source: 'e2e' }) });
  await signInAs(page, 'lincoln_analyst');
  await page.goto('/analyst');
  await page.getByRole('button', { name: 'Approve version' }).first().click();
  await expect(page.getByText(/Approved as PLAN-/)).toBeVisible();
});

test('judge QR page and calibration chart render', async ({ page }) => {
  await page.goto('/try');
  await expect(page.getByRole('img', { name: /QR code/ }).locator('svg')).toBeVisible();
  await page.goto('/calibration');
  await expect(page.getByText(/labelled examples/)).toBeVisible();
});
