// The QR-code journey: a new visitor signs up, answers the survey (with the wellness opt-in), lands on their own
// dashboard, stays signed in across a reload, and can sign out and back in. Shared by the local and Docker suites.
import { expect, test, type Page } from "@playwright/test";

export async function signUpAndOnboard(page: Page, email = `qr-${Date.now()}@example.com`) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel("First name").fill("Sam");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo-pass-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  const next = () => page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Acme Dental Low/).check();
  await next();
  await page.getByLabel("6–12 months ago").check();
  await next();
  await page.getByLabel("Just me").check();
  await next();
  await page.getByLabel(/All of it/).check();
  await next();
  await page.getByLabel("Braces (me or a child)").check();
  await next();
  await page.getByLabel("No, I usually stay put").check();
  await next();
  await page.getByRole("button", { name: /Answer and save/ }).click();
  const answer = (q: string, a: string) => page.getByRole("group", { name: q }).getByLabel(a, { exact: true }).check();
  await answer("How often do you brush?", "Once a day");
  await answer("How often do you floss?", "Rarely");
  await answer("Sugary drinks or snacks between meals?", "Several times a day");
  await answer("Do you use tobacco or vape?", "No");
  await answer("Do you grind or clench your teeth?", "Yes");
  await answer("Do your gums bleed when you brush?", "Yes");
  await answer("Does your mouth often feel dry?", "No");
  await page.getByRole("button", { name: /Finish and apply/ }).click();
  await expect(page.getByText("Hi Sam")).toBeVisible();
  return email;
}

export function registerSignupFlows() {
  test("a QR visitor signs up, onboards and gets their own dental year", async ({ page }) => {
    const email = await signUpAndOnboard(page);
    // Their survey built the profile: the braces goal and the predicted "maybe" work are planned.
    await page.goto("/treatment");
    await expect(page.getByText(/Braces/).first()).toBeVisible();
    // Signed in across a reload, on their own data.
    await page.reload();
    await expect(page.getByText(/Braces/).first()).toBeVisible();
    // Sign out, then back in.
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-pass-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Incorrect email or password.");
    await page.getByLabel("Password").fill("demo-pass-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Hi Sam")).toBeVisible();
  });

  test("the demo script works for a signed-up member", async ({ page }) => {
    test.setTimeout(180_000);
    await signUpAndOnboard(page);
    // Survey → profile, with the wellness discount.
    await expect(page.locator("#dental-profile")).toBeVisible();
    await expect(page.getByText(/10% off your premium/).first()).toBeVisible();

    // Photo of a past surgery's EOB: read in the browser, recorded once, identifiers removed before any AI.
    await page.goto("/treatment");
    const intake = page.locator("#intake");
    if (!(await intake.getByRole("button", { name: "Sample: insurance EOB for a past surgery" }).isVisible()))
      await intake.getByText("Add a treatment plan").click();
    await intake.getByRole("button", { name: "Sample: insurance EOB for a past surgery" }).click();
    await expect(page.getByText(/^Recorded: .*Annual max used/)).toBeVisible({ timeout: 90_000 });
    await expect(intake.getByText(/Removed before the AI read it|No direct identifiers found/).first()).toBeVisible();

    // Email agent: a forwarded EOB is read and answered; two kinds of notifications go out.
    await page.goto("/email");
    await page.getByRole("button", { name: /Insurance claim \(EOB\) for a past root canal/ }).click();
    await expect(page.locator("#received li").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#received").getByText(/Removed before the AI read it|No direct identifiers found/).first()).toBeVisible();
    await page.getByRole("button", { name: "Send this month’s overview now" }).first().click();
    await expect(page.getByText(/This month's overview was sent/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Show an urgent alert example" }).click();
    await expect(page.locator("#outbox").getByText("urgent", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#outbox").getByText("monthly", { exact: true }).first()).toBeVisible();

    // Wearables: a month of brushing updates the dental profile.
    await page.goto("/habits");
    await page.getByRole("button", { name: "Import last 30 days from my brush app (sample data)" }).click();
    await page.getByRole("button", { name: "Share with Ting to update my profile" }).click();
    await expect(page.getByText("Your profile was updated")).toBeVisible();
  });

  test("a guest can still explore the sample member", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Explore a sample member instead" }).click();
    await expect(page.getByText("Hi Dale")).toBeVisible();
  });
}
