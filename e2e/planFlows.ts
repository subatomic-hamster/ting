import { expect, test } from "@playwright/test";

/** Shared journeys: run against the local production build and the deployed API. */
export function registerPlanFlows() {
  test("plan overview exposes common benefits with optional detail and favicon red", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/plan");
    await expect(
      page.getByRole("heading", { name: "Your plan's rules", exact: true }),
    ).toBeVisible();
    for (const name of ["Cleanings", "Fillings", "Checkups", "Bitewing X-rays"])
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    for (const name of ["Monthly premium", "Annual maximum", "Deductible"])
      await expect(
        page.locator("dt").getByText(name, { exact: true }).first(),
      ).toBeVisible();
    const cleaning = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: "Cleanings", exact: true }),
      });
    await expect(cleaning).toContainText("100%");
    await expect(cleaning).toContainText("2 per calendar year");
    await expect(
      page.getByRole("heading", { name: "Root canals", exact: true }),
    ).not.toBeVisible();
    await page.getByText("Show more plan details", { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Root canals", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "All frequency limits", exact: true }),
    ).toBeVisible();
    await page.getByText("Show more plan details", { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Root canals", exact: true }),
    ).not.toBeVisible();
    expect(
      await page
        .getByRole("link", { name: "Ting home", exact: true })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe("rgb(173, 31, 45)");
    const wordmark = page.getByRole("link", { name: "Ting home", exact: true });
    await expect(wordmark).toHaveText("Ting.");
    expect(await wordmark.locator("span").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Source Serif 4");
    await expect(page.getByText(/Educational estimates|Sample account/i)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("four-question survey saves moving preference, restores it and updates the recommendation", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page
      .getByLabel("Planned dental work", { exact: true })
      .fill("3 fillings");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "When was your last cleaning?",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Not sure", { exact: true }).check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("My whole family", { exact: true }).check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByLabel("Yes, I move cities frequently", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save survey answers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your survey answers", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "These estimates still cover one person. Family costs are not included.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /Describe the dental work/ }),
    ).toHaveValue("3 fillings");
    await page
      .getByRole("link", { name: "See plan recommendations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Good if moving cities frequently",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Lowest modeled cost:/)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Good if moving cities frequently",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/treatment");
    await expect(
      page
        .locator("#items")
        .getByText("3 × Tooth-colored filling", { exact: true }),
    ).toHaveCount(0);
    await page.goto("/onboarding");
    await expect(
      page.getByRole("heading", { name: "Your survey answers", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Edit survey answers", exact: true })
      .click();
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByLabel("No, I usually stay in one city", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save survey answers", exact: true })
      .click();
    await page
      .getByRole("link", { name: "See plan recommendations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Good if moving cities frequently",
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("sample benefits PDF loads its worker and requires review before application", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const workerResponses: { status: number; type: string }[] = [];
    page.on("response", (response) => {
      if (/pdf\.worker.*\.mjs/.test(response.url()))
        workerResponses.push({
          status: response.status(),
          type: response.headers()["content-type"] ?? "",
        });
    });
    // Exercise the PDF text fallback even when AWS could read this PDF through Textract.
    // Local mock mode has no HTTP /documents request, so the same test reads the PDF directly.
    await page.route("**/documents?*", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: '{"error":"Single-page OCR unavailable"}',
      }),
    );
    await page.goto("/plan");
    await page
      .getByLabel("Upload benefits summary", { exact: true })
      .setInputFiles("public/samples/acme-benefits-summary.pdf");
    await expect(
      page.getByRole("button", {
        name: "Confirm extracted coverage",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("#load [role=alert]")).toHaveCount(0);
    const answer = page.getByLabel(
      "Is endodontics basic or major on your plan?",
    );
    // The local reader asks this question; the live reader can find the answer in the PDF.
    if (await answer.isVisible()) await answer.selectOption("basic");
    await expect(
      page.getByRole("button", { name: "Confirm extracted coverage", exact: true }),
    ).toBeEnabled();
    const extracted = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Rules read from the document", exact: true }),
    }).last();
    await extracted.getByText("Show more plan details", { exact: true }).click();
    const rootCanal = extracted.locator("article").filter({
      has: page.getByRole("heading", { name: "Root canals", exact: true }),
    });
    await expect(rootCanal.locator("dd").first()).toHaveText("80%");
    await page
      .getByRole("button", { name: "Confirm extracted coverage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use as my current plan", exact: true })
      .click();
    await expect(page.locator("#load [role=status]")).toContainText(
      "as your current plan",
    );
    for (const response of workerResponses) {
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/(?:javascript|ecmascript)/);
    }
    // The PDF reader is exercised in mock mode; AWS may also extract it before fallback is needed.
  });

  test("insurance card image scans the group and member without inventing coverage", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/plan");
    await page
      .getByLabel("Scan insurance card", { exact: true })
      .setInputFiles("public/samples/insurance-card.png");
    await expect(page.locator("#load [role=status]")).toContainText(
      "group 00412345",
      { timeout: 90_000 },
    );
    await expect(page.locator("#load [role=status]")).toContainText(
      "member SAMPLE12345",
    );
    await expect(page.locator("#load [role=status]")).toContainText(
      "your employer offers",
    );
    await expect(
      page.getByRole("button", { name: "Use as my current plan", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Scan insurance card", { exact: true })
      .setInputFiles({
        name: "blurred-card.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("No readable card information"),
      });
    await expect(page.locator("#load [role=status]")).toContainText(
      "No group number found",
    );
  });

  test("horizontal waterfall remains visible and readable on mobile", async ({
    page,
  }) => {
    await page.goto("/treatment");
    const waterfall = page.getByRole("list", {
      name: "Horizontal cost waterfall",
      exact: true,
    });
    await expect(waterfall).toBeVisible();
    await expect(waterfall.locator("li").first()).toContainText("$1,180");
    const bars = waterfall.locator('li > div[aria-hidden="true"]');
    expect(await bars.count()).toBeGreaterThan(2);
    for (const bar of await bars.all()) {
      await expect(bar).toBeVisible();
      expect((await bar.boundingBox())!.width).toBeGreaterThan(100);
    }
    await expect(page.getByText(/Plan rule:/).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}
