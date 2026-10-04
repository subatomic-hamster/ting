// Local build, mock API: everything runs in the browser on demo data.
import { expect, test, type Page } from '@playwright/test';

const pageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => errors;
};

const ROUTES = ['/', '/treatment', '/enroll', '/dentists', '/plan', '/email', '/record', '/habits', '/program', '/admin', '/analyst', '/calibration'];

test('every page renders on the mock API with no errors and no sideways scroll', async ({ page }) => {
  const errors = pageErrors(page);
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(1);
  }
  expect(errors()).toEqual([]);
});

test('dashboard runs the engine in the browser', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByText('Hi Dale')).toBeVisible();
  await expect(page.getByText('mock API')).toBeVisible();
  await expect(page.getByText(/Your annual maximum/)).toBeVisible();
});

test('a mock claim arrives and is checked against the estimate', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Fire mock claim' }).click();
  await expect(page.getByText('New EOB')).toBeVisible();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
});

test('moving the crown before Dec 31 re-prices the plan', async ({ page }) => {
  await page.goto('/treatment');
  const crown = page.getByRole('button', { name: /^Crown \(porcelain\) on #30, .*Use left and right arrows/ });
  await crown.focus();
  await crown.press('Shift+ArrowLeft');
  await expect(page.getByText(/moved to Dec \d+, \d{4}\. You pay \$[\d,.]+ in total \(\+\$[\d,.]+\)/).first()).toBeAttached();
});

test('typed intake finds the crown on #19', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByRole('textbox', { name: /Describe the dental work/ }).fill('crown on tooth 19');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  await expect(page.getByText(/Crown \(porcelain\) on #19/).first()).toBeVisible();
});

test('"I need 2 fillings" is one appointment: same date on the timeline, and they move together', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByRole('textbox', { name: /Describe the dental work/ }).fill('I need 2 fillings');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  await page.getByRole('button', { name: 'Add to plan' }).click();
  const fillings = page.getByRole('button', { name: /^Tooth-colored filling \(2 surfaces\), .*Use left and right arrows/ });
  await expect(fillings).toHaveCount(2);
  const dates = async () => {
    const names = await fillings.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent ?? ''));
    return names.map((n) => /, (\w{3} \d{1,2}, \d{4}), you pay/.exec(n)?.[1]);
  };
  const [a, b] = await dates();
  expect(a).toBeTruthy();
  expect(b).toBe(a);
  await fillings.first().focus();
  await fillings.first().press('Shift+ArrowRight');
  await expect.poll(async () => new Set(await dates()).size).toBe(1);
  await expect.poll(async () => (await dates())[0]).not.toBe(a);
});
