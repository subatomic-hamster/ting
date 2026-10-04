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

test('"3 fillings" is one appointment: one row, one card, one timeline chip that moves as one; no invented numbers', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByRole('textbox', { name: /Describe the dental work/ }).fill('3 fillings');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  const intake = page.locator('#intake');
  await expect(intake.getByText('3 × Tooth-colored filling', { exact: true })).toBeVisible();
  await expect(intake.getByText(/surfaces/)).toHaveCount(0); // nobody said how many surfaces
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.locator('#items').getByText('3 × Tooth-colored filling', { exact: true })).toBeVisible();
  const chip = page.getByRole('button', { name: /^3 × Tooth-colored filling, .*Use left and right arrows/ });
  await expect(chip).toHaveCount(1);
  const dateOf = async () => /, (\w{3} \d{1,2}, \d{4}), you pay/.exec((await chip.getAttribute('aria-label')) ?? '')?.[1];
  const before = await dateOf();
  await chip.focus();
  await chip.press('Shift+ArrowRight');
  await expect.poll(dateOf).not.toBe(before);
});

test('wisdom teeth: one appointment, and no tooth numbers nobody said', async ({ page }) => {
  await page.goto('/treatment');
  await page.getByRole('textbox', { name: /Describe the dental work/ }).fill('Two wisdom teeth out');
  await page.getByRole('button', { name: 'Find procedures' }).click();
  const intake = page.locator('#intake');
  await expect(intake.getByText(/^2 × Wisdom tooth removal/)).toBeVisible();
  await expect(intake.locator('ul li').getByText(/#\d/)).toHaveCount(0);
});

test('the cost breakdown shows its words at once, without a loading state', async ({ page }) => {
  await page.goto('/treatment');
  const fig = page.locator('#waterfall figure');
  await expect(fig.getByText(/^Your dentist's fee for the /)).toBeVisible({ timeout: 2_000 });
  await expect(page.getByText(/Checking|Verified/)).toHaveCount(0);
  await expect(page.getByText('Demo fees')).toHaveCount(0);
  await expect(page.getByText('Questions for your dentist')).toHaveCount(0);
});
