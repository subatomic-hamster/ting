import { expect, test, type Page } from "../fixtures";
import { readFile } from "node:fs/promises";
const errorsFor = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};
const ROUTES = [
  "/",
  "/treatment",
  "/enroll",
  "/dentists",
  "/plan",
  "/email",
  "/onboarding",
  "/record",
  "/habits",
  "/program",
  "/admin",
  "/analyst",
  "/calibration",
];
test("every route renders without page errors or global horizontal overflow", async ({
  page,
}) => {
  const errors = errorsFor(page);
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      route,
    ).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
test("dashboard shows estimate scope and one primary next action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hi Dale" })).toBeVisible();
  await expect(page.getByText(/Estimated amount you pay across/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review treatment and dates" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review treatment and dates" }).click();
  await expect(page).toHaveURL(/treatment/);
});
test("navigation reaches every member task and supports Escape", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Messages", exact: true })
    .click();
  await expect(page).toHaveURL(/email/);
  await expect(
    page.getByRole("navigation", { name: "Main" }),
  ).not.toBeVisible();
});
test("mock claim remains functional and matches the engine", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Fire mock claim" }).click();
  await page.getByRole("button", { name: "Hide demo panel" }).click();
  await page.locator("#activity summary").click();
  await expect(page.getByText("New EOB")).toBeVisible();
  await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
});
test("typed repeated fillings retain one visit and can be moved by date without dragging", async ({
  page,
}) => {
  await page.goto("/treatment");
  await page.locator("#intake summary").first().click();
  await page
    .getByRole("textbox", { name: /Describe the dental work/ })
    .fill("3 fillings");
  await page.getByRole("button", { name: "Find procedures" }).click();
  const intake = page.locator("#intake");
  await expect(
    intake.getByText("3 × Tooth-colored filling", { exact: true }),
  ).toBeVisible();
  await expect(intake.getByText(/surfaces/)).toHaveCount(0);
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(
    page
      .locator("#items")
      .getByText("3 × Tooth-colored filling", { exact: true }),
  ).toBeVisible();
  // The visual timeline leads on desktop; typing dates is one tap away (open by default on phones).
  const typing = page.locator("details", { has: page.getByText("Change dates by typing them") });
  if (!(await typing.evaluate((d: HTMLDetailsElement) => d.open))) await typing.locator("summary").click();
  const input = page.getByLabel("Date for 3 × Tooth-colored filling", {
    exact: true,
  });
  const before = await input.inputValue();
  const year = Number(before.slice(0, 4));
  await input.fill(`${year + 1}-02-01`);
  await input
    .locator("xpath=../..")
    .getByRole("button", { name: "Apply date" })
    .click();
  await expect(
    page.getByText(/3 × Tooth-colored filling moved to Feb 1/).first(),
  ).toBeAttached();
  await page.reload();
  await expect(input).toHaveValue(`${year + 1}-02-01`);
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
test("search filtering cannot submit a hidden braces procedure", async ({
  page,
}) => {
  await page.goto("/treatment");
  const catalog = page.locator("#catalog");
  await catalog.locator("summary").first().click();
  await catalog.getByLabel("Search procedures").fill("root canal");
  await expect(catalog.getByLabel("Procedure", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    catalog.getByRole("button", { name: "Add selected procedure" }),
  ).toHaveCount(0);
  await catalog.getByLabel("Procedure", { exact: true }).selectOption("D3348");
  await expect(
    catalog.getByLabel("Dentist fee for one procedure ($)"),
  ).toBeVisible();
  await expect(catalog.getByText(/For braces or aligners/)).toHaveCount(0);
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
test("edited quote with confirmed allowance reprices and persists", async ({
  page,
}) => {
  await page.goto("/treatment");
  const cost = page.locator("#waterfall");
  await cost
    .getByText("Update dentist fee and insurer allowance", { exact: true })
    .click();
  await cost.getByLabel("Dentist’s fee ($)", { exact: true }).fill("1500");
  await cost.getByLabel("Confirmed insurer allowance ($)").fill("1000");
  await cost.getByRole("button", { name: "Update estimate" }).click();
  await expect(cost.getByRole("status")).toContainText("Updated");
  await expect(cost.getByText(/Insurer allowance unavailable/)).toHaveCount(0);
  await page.reload();
  await cost.getByText("Price sources", { exact: true }).click();
  await expect(cost.getByText(/Dentist quote entered by you/)).toBeVisible();
  await expect(
    cost.getByText(/Insurer allowance entered by you/),
  ).toBeVisible();
});
test("removing treatment persists and invalid handoff never reveals a sample patient", async ({
  page,
}) => {
  await page.goto("/treatment");
  await page
    .getByRole("button", {
      name: "Remove Crown (porcelain) on #30",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove Crown (porcelain) on #30",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto("/share/not-a-real-token");
  await expect(
    page.getByRole("heading", { name: "Shared plan unavailable" }),
  ).toBeVisible();
  await expect(page.getByText(/Dale|Home-care summary/)).toHaveCount(0);
});
test("brushing deletion and private email settings persist", async ({
  page,
}) => {
  await page.goto("/habits");
  await page.getByRole("button", { name: "Leave and delete my data" }).click();
  await page
    .getByRole("button", { name: "Delete sessions and leave", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("Not collecting or sharing brushing data."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Opt in to SmileStreak" }),
  ).toBeVisible();
  await page.goto("/email");
  await expect(page.getByLabel("Private mode")).toBeChecked();
  await page.getByLabel("Your email address").fill("sample@example.test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Private mode")).toBeChecked();
  await expect(page.getByLabel("Your email address")).toHaveValue(
    "sample@example.test",
  );
});
test("recommended calendar and handoff use the displayed enrollment dates after changing active treatment schedule", async ({
  page,
}) => {
  await page.goto("/treatment");
  await page.getByRole("tab", { name: /Fastest/ }).click();
  await page.goto("/enroll");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar file", exact: true })
    .click();
  const download = await downloadEvent;
  const ics = await readFile((await download.path())!, "utf8");
  expect(ics).toContain("BEGIN:VCALENDAR");
  await page.getByRole("button", { name: "Create dentist share link" }).click();
  const link = page.getByRole("link", { name: /\/share\// });
  await expect(link).toBeVisible();
  const url = (await link.getAttribute("href"))!;
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: /Dale’s treatment plan/ }),
  ).toBeVisible();
  for (const date of await page.locator("article dd").allTextContents()) {
    if (/^\w{3} \d+, \d{4}/.test(date)) {
      const d = new Date(date.split(". ")[0]);
      const raw = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      expect(ics).toContain(`DTSTART;VALUE=DATE:${raw}`);
    }
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Dale’s treatment plan/ }),
  ).toBeVisible();
});
test("cost explanations are shown in plain words without verification badges", async ({
  page,
}) => {
  await page.goto("/treatment");
  const cost = page.locator("#waterfall");
  await expect(cost.getByText("Estimated amount you pay")).toBeVisible();
  await expect(cost.getByText(/^The demo fee for/)).toBeVisible();
  await expect(
    page.locator("main").getByText(/Verified|Proved|question type|Winnow/),
  ).toHaveCount(0);
});
test("insurance document upload retains coverage review and plan application", async ({
  page,
}) => {
  await page.goto("/plan");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/samples/acme-benefits-summary.txt");
  await page
    .getByLabel("Is endodontics basic or major on your plan?")
    .selectOption("basic");
  await expect(
    page.getByRole("button", { name: "Confirm extracted coverage" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm extracted coverage" })
    .click();
  await expect(
    page.getByRole("button", { name: "Use as my current plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use as my current plan" }).click();
  await expect(page.getByRole("status")).toContainText("as your current plan");
});

test("removal can be undone and restored treatment survives reload", async ({
  page,
}) => {
  await page.goto("/treatment");
  const removal = page.getByRole("button", {
    name: "Remove Crown (porcelain) on #30",
    exact: true,
  });
  await removal.click();
  await expect(removal).toHaveCount(0);
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(removal).toBeVisible();
  await page.reload();
  await expect(removal).toBeVisible();
});
test("brushing calendar exposes dates and accessible day details", async ({
  page,
}) => {
  await page.goto("/habits");
  const day = page
    .getByRole("list", { name: "Brushing calendar, last 5 weeks" })
    .getByRole("button")
    .last();
  await expect(day).toContainText(/\w+ \d+/);
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /recorded sessions|No data collected/ }),
  ).toBeVisible();
});
test("treatment photo upload reaches reviewed priced items and preserves adding", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/treatment");
  await page.locator("#intake summary").first().click();
  const intake = page.locator("#intake");
  await intake
    .locator("input[type=file]")
    .setInputFiles("public/samples/treatment-plan.png");
  await expect(intake.getByText(/Read your treatment plan: found/)).toBeVisible(
    { timeout: 90000 },
  );
  await expect(
    intake.getByLabel("Dentist fee ($), per item").first(),
  ).toHaveValue("1180");
  await intake
    .getByRole("button", { name: "Add to plan", exact: true })
    .click();
  await expect(intake.getByText(/Added \d+ items? to your plan/)).toBeVisible();
  await expect(
    page
      .locator("#items")
      .getByRole("button", { name: /Root canal.*Fee \$1,180/ })
      .last(),
  ).toBeVisible();
});
test("PDF plan extraction still requires review before coverage application", async ({
  page,
}) => {
  await page.goto("/plan");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/samples/acme-benefits-summary.pdf");
  await expect(
    page.getByRole("button", { name: "Confirm extracted coverage" }),
  ).toBeVisible();
  await page
    .getByLabel("Is endodontics basic or major on your plan?")
    .selectOption("basic");
  await page
    .getByRole("button", { name: "Confirm extracted coverage" })
    .click();
  await expect(
    page.getByRole("button", { name: "Use as my current plan" }),
  ).toBeVisible();
});
test("invoice upload shows reconciliation rather than adding duplicate treatment", async ({
  page,
}) => {
  await page.goto("/treatment");
  await page.locator("#intake summary").first().click();
  const intake = page.locator("#intake");
  await intake
    .locator("input[type=file]")
    .setInputFiles("public/samples/invoice.txt");
  await expect(intake.getByText(/This is a dentist's bill/)).toBeVisible();
  await expect(intake.getByText(/Dentist’s bill/)).toBeVisible();
  await expect(
    intake.getByText(
      /No insurance claim for this visit yet|The bill matches|Linked to claim|Is this the bill/,
    ),
  ).toBeVisible();
  await expect(
    intake.getByRole("button", { name: "Add to plan", exact: true }),
  ).toHaveCount(0);
});
test("actual filling allowance cannot borrow a sample alternate-benefit rate", async ({
  page,
}) => {
  await page.goto("/treatment");
  const catalog = page.locator("#catalog");
  await catalog.locator("summary").first().click();
  await catalog.getByLabel("Procedure", { exact: true }).selectOption("D2392");
  await catalog.getByLabel("Dentist fee for one procedure ($)").fill("300");
  await catalog
    .getByLabel("Insurer allowed amount ($), if confirmed")
    .fill("250");
  await catalog.getByLabel("Tooth number, if stated (optional)").fill("30");
  await catalog.getByRole("button", { name: "Add selected procedure" }).click();
  await page
    .locator("#items")
    .getByRole("button", { name: /Tooth-colored filling.*Fee \$300/ })
    .last()
    .click();
  const cost = page.locator("#waterfall");
  await expect(
    cost.getByText(/Alternate-benefit allowance unavailable/),
  ).toBeVisible();
  await cost
    .getByText("Update dentist fee and insurer allowance", { exact: true })
    .click();
  await cost
    .getByLabel("Confirmed alternate-benefit allowance ($)")
    .fill("180");
  await cost.getByRole("button", { name: "Update estimate" }).click();
  await expect(
    cost.getByText(/Alternate-benefit allowance unavailable/),
  ).toHaveCount(0);
});
