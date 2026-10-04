import { expect, test } from "./fixtures";
import { resetDemo, failOnPageErrors } from "./helpers";

test("release uses live API and member routes fit the viewport", async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto("/?demo=1");
  await expect(page.getByText("live API", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Hide demo panel" }).click();
  await expect(page.getByRole("heading", { name: "Your dental care", exact: true })).toBeVisible();
  for (const route of ["/treatment", "/enroll", "/dentists", "/plan", "/email", "/onboarding", "/record", "/habits", "/program", "/calibration"]) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account unavailable" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
  }
  expect(errors()).toEqual([]);
});

test("live claim arrives and is replayed after reload", async ({ page }) => {
  const response = await resetDemo("dale");
  expect(response.ok).toBeTruthy();
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Your dental care", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dentist visit" }).click();
  await page.getByRole("button", { name: "Hide demo panel" }).click();
  await page.locator("#activity summary").click();
  await expect(page.getByText("New EOB")).toBeVisible();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Hide demo panel" }).click();
  await page.locator("#activity summary").click();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
});

test("full-course braces quote stays separate from unknown insurer allowance and survives reload", async ({
  page,
}) => {
  await page.goto("/treatment");
  const catalog = page.locator("#catalog");
  await catalog.locator("summary").first().click();
  await catalog.getByLabel("Procedure", { exact: true }).selectOption("D8090");
  await catalog.getByLabel("Full-course dentist fee ($)").fill("6200");
  await catalog.getByRole("button", { name: "Add selected procedure" }).click();
  await expect(catalog.getByRole("status")).toContainText(
    "Added Braces (adult)",
  );
  await page
    .locator("#items")
    .getByRole("button", { name: /Braces \(adult\).*Fee/ })
    .click();
  await expect(
    page.locator("#waterfall").getByText(/Insurer allowance unavailable/),
  ).toBeVisible();
  await expect(
    page.locator("#waterfall figure").getByText("$6,200").first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator("#items").getByText("Braces (adult)", { exact: true }),
  ).toBeVisible();
});
test("published provider reference retains source and unknown allowance", async ({
  page,
}) => {
  await page.goto("/treatment");
  const catalog = page.locator("#catalog");
  await catalog.locator("summary").first().click();
  await catalog.getByLabel("Procedure", { exact: true }).selectOption("D2740");
  await catalog
    .getByText("Published clinic price reference", { exact: true })
    .click();
  await catalog
    .getByLabel("Use this clinic’s charge as a price reference")
    .check();
  await expect(
    catalog.getByLabel("Dentist fee for one procedure ($)"),
  ).toHaveValue("900");
  await catalog.getByRole("button", { name: "Add selected procedure" }).click();
  await expect(catalog.getByRole("status")).toContainText("Added Crown");
  const row = page
    .locator("#items")
    .getByRole("button", { name: /Crown \(porcelain\).*Fee \$900/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await page
    .locator("#waterfall")
    .getByText("Price sources", { exact: true })
    .click();
  await expect(
    page
      .locator("#waterfall")
      .getByText(/Published Cleveland Avenue Dental Center charge/),
  ).toBeVisible();
  await expect(
    page.locator("#waterfall").getByText(/Insurer allowance unavailable/),
  ).toBeVisible();
});

test("tap date edits survive a live profile refresh", async ({ page }) => {
  await page.goto("/treatment");
  const typing = page.locator("details", { has: page.getByText("Change dates by typing them") });
  if (!(await typing.evaluate((d: HTMLDetailsElement) => d.open))) await typing.locator("summary").click();
  const input = page.getByLabel("Date for Crown (porcelain) on #30", { exact: true });
  const before = await input.inputValue();
  const date = `${before.slice(0, 4)}-02-15`;
  await input.fill(date);
  await input.locator("xpath=../..").getByRole("button", { name: "Apply date" }).click();
  await expect(page.getByText(/Crown .* moved to Feb 15/).first()).toBeAttached();
  await page.reload();
  if (!(await typing.evaluate((d: HTMLDetailsElement) => d.open))) await typing.locator("summary").click();
  await expect(input).toHaveValue(date);
});

test("live shares open immutable snapshots and invalid links stay unavailable", async ({ page, browser }) => {
  await page.goto("/treatment");
  await page.getByRole("button", { name: "Create dentist share link" }).click();
  const link = page.getByRole("link", { name: /https:\/\/.*\/share\// });
  await expect(link).toBeVisible();
  const url = await link.getAttribute("href");
  const other = await browser.newContext();
  const dentist = await other.newPage();
  await dentist.goto(url!);
  await expect(dentist.getByRole("heading", { name: /’s treatment plan/ })).toBeVisible();
  await expect(dentist.getByText("Planned appointments", { exact: true })).toBeVisible();
  await dentist.goto(new URL("/share/not-a-real-token", url!).href);
  await expect(dentist.getByRole("heading", { name: "Shared plan unavailable" })).toBeVisible();
  await expect(dentist.getByRole("heading", { name: /Dale/ })).toHaveCount(0);
  await other.close();
});

test("offline treatment keeps the server snapshot and browser engine", async ({ page, context, browserName }) => {
  await page.goto("/treatment");
  await expect(page.getByText("Estimated total you pay", { exact: true })).toBeVisible();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration())?.active);
  if (browserName !== "webkit") {
    await page.reload();
    await expect(page.getByText("Estimated total you pay", { exact: true })).toBeVisible();
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  }
  await context.setOffline(true);
  await page.locator("#intake summary").first().click();
  await page.getByRole("textbox", { name: /Describe the dental work/ }).fill("cleaning and x-rays");
  await page.getByRole("button", { name: "Find procedures" }).click();
  await expect(page.getByText(/Found 2 items/)).toBeVisible();
  if (browserName !== "webkit") {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your treatment", exact: true })).toBeVisible();
  }
  await context.setOffline(false);
});
