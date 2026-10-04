import { expect, test } from "@playwright/test";
const routes = [
  "/",
  "/treatment",
  "/enroll",
  "/dentists",
  "/email",
  "/plan",
  "/habits",
  "/onboarding",
  "/try",
  "/share/invalid",
];
for (const width of [320, 375, 390, 430, 768]) {
  test(`member layouts at ${width}px with normal and 200% text reflow`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop-chrome",
      "Chromium covers explicit viewport matrix; WebKit covers functional mobile suite.",
    );
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        route,
      ).toBeLessThanOrEqual(1);
      const type = await page
        .getByRole("heading", { level: 1 })
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(parseFloat(type), route).toBeGreaterThanOrEqual(32);
      if (route === "/treatment") {
        // Explanations are shown inline; the price editor is the remaining disclosure.
        await page
          .locator("#waterfall")
          .getByText("Update dentist fee and insurer allowance", {
            exact: true,
          })
          .click();
      }
      if (route === "/habits") {
        await page
          .getByRole("button", { name: "Leave and delete my data" })
          .click();
        await page
          .getByRole("button", { name: "Delete sessions and leave" })
          .click();
      }
      // Explicit text-only doubling simulation: snapshot computed sizes before mutations, then double each.
      await page.evaluate(() => {
        const sizes = Array.from(
          document.querySelectorAll<HTMLElement>("body,body *"),
        ).map((el) => ({
          el,
          size: parseFloat(getComputedStyle(el).fontSize),
          line: parseFloat(getComputedStyle(el).lineHeight),
        }));
        for (const { el, size, line } of sizes) {
          if (el instanceof SVGElement) continue;
          el.style.fontSize = `${size * 2}px`;
          if (Number.isFinite(line)) el.style.lineHeight = `${line * 2}px`;
        }
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        `${route} at200% text`,
      ).toBeLessThanOrEqual(1);
      if (route === "/treatment") {
        const date = page.getByLabel("Date for Crown (porcelain) on #30", {
          exact: true,
        });
        expect((await date.boundingBox())!.width).toBeGreaterThan(
          width < 430 ? width - 65 : 200,
        );
        const offenders = await page
          .locator(
            "main button,main select,main input:not([type=checkbox]):not([type=radio]):not([type=file]),main summary",
          )
          .evaluateAll((elements) =>
            elements
              .filter((el) => {
                const b = el.getBoundingClientRect();
                return (
                  b.width > 0 &&
                  b.height > 0 &&
                  getComputedStyle(el).visibility !== "hidden" &&
                  b.height < 47
                );
              })
              .map((el) => ({
                text: el.textContent?.slice(0, 60),
                height: el.getBoundingClientRect().height,
              })),
          );
        expect(offenders).toEqual([]);
      }
    }
    expect(errors).toEqual([]);
  });
}
