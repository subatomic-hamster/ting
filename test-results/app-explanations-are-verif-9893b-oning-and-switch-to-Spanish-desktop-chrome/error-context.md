# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> explanations are verified, proved by Automated Reasoning, and switch to Spanish
- Location: e2e/app.spec.ts:68:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/\b(pagas|tu plan|el plan)\b/i).first()
Expected: visible
Timeout: 45000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/\b(pagas|tu plan|el plan)\b/i).first() with timeout 45000ms
  - waiting for getByText(/\b(pagas|tu plan|el plan)\b/i).first()

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - text: Ting Dale · Acme Manufacturing Plan
  - combobox "Dental plan":
    - option "Lincoln DentalConnect Low" [selected]
    - option "Lincoln DentalConnect High"
  - radiogroup "Dentist network":
    - radio "In-network" [checked]
    - radio "Out"
  - radiogroup "Explanation language":
    - radio "en"
    - radio "es" [checked]
  - button "Audit trail"
  - button "Sign in with Acme"
- navigation "Main":
  - list:
    - listitem:
      - link "Dashboard":
        - /url: /
    - listitem:
      - link "Treatment":
        - /url: /treatment
    - listitem:
      - link "Enroll":
        - /url: /enroll
    - listitem:
      - link "Dentists":
        - /url: /dentists
    - listitem:
      - link "Plan rules":
        - /url: /plan
    - listitem:
      - link "SmileStreak":
        - /url: /habits
    - listitem:
      - link "Get started":
        - /url: /onboarding
    - listitem:
      - link "Employer":
        - /url: /admin
    - listitem:
      - link "Lincoln view":
        - /url: /program
    - listitem:
      - link "Rules review":
        - /url: /analyst
- main:
  - heading "Your treatment" [level=1]
  - text: What you'll owe, step by step, and the cheapest time to do it. Lincoln DentalConnect Low · in-network dentist.
  - paragraph: Sample plan — confirm against the official plan document.
  - region "1. What did your dentist recommend?":
    - heading "1. What did your dentist recommend?" [level=2]
    - text: Describe the dental work you've been told you need
    - textbox "Describe the dental work you've been told you need":
      - /placeholder: "e.g. \"Root canal on #19, then a buildup and a crown\""
    - button "Speak"
    - button "Photo of treatment plan"
    - button "Upload a photo of your treatment plan"
    - button "Find procedures" [disabled]
    - 'button "Root canal and a crown on #19"'
    - button "Two wisdom teeth out"
    - button "Crown on a lower back molar, replacing the old one"
    - button "Cleaning and X-rays"
    - link "Sample treatment plan photo":
      - /url: /samples/treatment-plan.png
    - paragraph
  - region "2. Your items":
    - heading "2. Your items" [level=2]
    - text: Demo fees · ZIP 27401
    - list:
      - listitem:
        - 'button "Root canal (molar) on #19 D3330 Fee $1,180 · you pay $200 · dentist''s deadline Nov 13, 2026" [pressed]'
        - 'button "Remove Root canal (molar) on #19"'
      - listitem:
        - 'button "Core buildup on #19 D2950 Fee $330 · you pay $125 · dentist''s deadline Mar 31, 2027"'
        - 'button "Remove Core buildup on #19"'
      - listitem:
        - 'button "Crown (porcelain) on #19 D2740 Fee $1,450 · you pay $625 · dentist''s deadline Mar 31, 2027"'
        - 'button "Remove Crown (porcelain) on #19"'
      - listitem:
        - 'button "Crown (porcelain) on #30 D2740 Fee $1,450 · you pay $600 · dentist''s deadline Mar 31, 2027"'
        - 'button "Remove Crown (porcelain) on #30"'
      - listitem:
        - button "Cleaning D1110 Fee $120 · you pay $0 · dentist's deadline Jan 31, 2027"
        - button "Remove Cleaning"
      - listitem:
        - 'button "Root canal (molar) on #3 D3330 maybe · 30% Fee $1,180 · you pay $675 · dentist''s deadline Dec 31, 2027"'
        - 'button "Remove Root canal (molar) on #3"'
  - 'region "3. What you''ll pay: Root canal (molar) on #19"':
    - text: From the engine · rules PLAN-ACME-LOW-v3
    - 'heading "3. What you''ll pay: Root canal (molar) on #19" [level=2]'
    - 'figure "Cost waterfall for Root canal (molar) on #19. Dentist''s fee: $1,180; In-network discount: −$180; Plan pays 80%: −$800; You pay: $200."':
      - list:
        - listitem:
          - text: Dentist's fee $1,180 Running total $1,180 Verified
          - paragraph: El consultorio dental cobra $1,180 por el tratamiento de conducto en la muela número 19.
        - listitem:
          - text: In-network discount −$180 Running total $1,000 Verified
          - paragraph: El consultorio está en la red de Lincoln, así que el precio es $1,000 en lugar de $1,180, lo que ahorra $180.
        - listitem:
          - button "Plan pays 80%"
          - text: "−$800 Running total $200 Verified Proved Plan rule: Schedule of Benefits, §2"
          - paragraph: Lincoln paga el 80% de $1,000 para este tipo de tratamiento, lo que es $800.
        - listitem:
          - text: You pay $200 Running total $200 Verified
          - paragraph: Usted paga $200.
      - text: You pay $200 · rules PLAN-ACME-LOW-v3
  - region "4. When to do it":
    - heading "4. When to do it" [level=2]
    - tablist "Schedule options":
      - tab "Cheapest $1,752.50 saves $1,082.50 · done Jan 4" [selected]
      - tab "Fastest $2,835 baseline · done Oct 17"
      - tab "Balanced $1,752.50 saves $1,082.50 · done Jan 4"
    - text: Cheapest · Lowest cost after the max, deductible and FSA $1,752.50
    - term: "After FSA tax savings:"
    - definition: $946.75
    - term: "Finished by:"
    - definition: Jan 4, 2027
    - term: "Vs. doing it all now:"
    - definition: saves $1,082.50
    - paragraph: "\"Maybe\" work counts by its odds. Checked 24 possible schedules."
    - tabpanel "Treatment timeline":
      - paragraph: Drag a visit, or focus it and use ← → (a week) or Shift + ← → (a month). The bold line is Dec 31, when your annual max resets.
      - group "Treatment timeline for 2026 and 2027":
        - text: 2026 max $190 left of $1,500
        - 'img "2026 annual maximum $1,500: $300 used, $1,010 scheduled, $190 remaining."'
        - text: 2027 max $227.50 left of $1,500
        - 'img "2027 annual maximum $1,500: $0 used, $1,272.50 scheduled, $227.50 remaining."'
        - 'button "Root canal (molar) on #19, Oct 3, 2026, you pay $200. Locked: your dentist set this date." [disabled]': "Root canal (molar) on #19 Oct 3, 2026 · $200"
        - 'button "Core buildup on #19, Oct 10, 2026, you pay $125. Use left and right arrows to move a week, Shift plus arrows to move a month."': "Core buildup on #19 Oct 10, 2026 · $125"
        - 'button "Crown (porcelain) on #19, Jan 4, 2027, you pay $625. Use left and right arrows to move a week, Shift plus arrows to move a month."': "Crown (porcelain) on #19 Jan 4, 2027 · $625"
        - 'button "Crown (porcelain) on #30, Jan 4, 2027, you pay $600. Use left and right arrows to move a week, Shift plus arrows to move a month."': "Crown (porcelain) on #30 Jan 4, 2027 · $600"
        - button "Cleaning, Oct 3, 2026, you pay $0. Use left and right arrows to move a week, Shift plus arrows to move a month.": Cleaning Oct 3, 2026 · $0
        - 'button "Root canal (molar) on #3 (maybe, 30%), Jan 4, 2027, you pay $675. Use left and right arrows to move a week, Shift plus arrows to move a month."': "Root canal (molar) on #330% Jan 4, 2027 · $675"
        - status
      - paragraph
  - region "5. Questions for your dentist":
    - heading "5. Questions for your dentist" [level=2]
    - button "Share with my dentist"
    - list:
      - listitem: "Can the crown (porcelain) on #19 safely wait until Jan 4, 2027?"
      - listitem: "Can the crown (porcelain) on #30 safely wait until Jan 4, 2027?"
      - listitem: "Can the root canal (molar) on #3 safely wait until Jan 4, 2027?"
      - listitem: Is there an equally good option that costs less?
      - listitem: Will you send a pre-treatment estimate to my insurer first?
- contentinfo:
  - paragraph: Educational estimate — not insurance or tax advice.
  - paragraph: Ting is a hackathon prototype. Confirm costs with your dentist and your official plan documents.
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | import { api, failOnPageErrors, idToken, resetDemo, signInAs } from './helpers';
  3   | 
  4   | test.beforeEach(async () => {
  5   |   await resetDemo('dale');
  6   | });
  7   | 
  8   | test('dashboard loads on the live API with engine numbers and no layout overflow', async ({ page }) => {
  9   |   const errors = failOnPageErrors(page);
  10  |   await page.goto('/?demo=1');
  11  |   await expect(page.getByText('Hi Dale')).toBeVisible();
  12  |   await expect(page.getByText('live API')).toBeVisible();
  13  |   await expect(page.getByText(/Your annual maximum/)).toBeVisible();
  14  |   const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  15  |   expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
  16  |   expect(errors()).toEqual([]);
  17  | });
  18  | 
  19  | test('moving the crown before Dec 31 re-prices the plan', async ({ page }) => {
  20  |   await page.goto('/treatment');
  21  |   const crown = page.getByRole('button', { name: /^Crown \(porcelain\) on #30, .*Use left and right arrows/ });
  22  |   await crown.focus();
  23  |   await crown.press('Shift+ArrowLeft'); // a month earlier: from January into December
  24  |   // The screen-reader announcement carries the engine's re-priced total: this year's max is used up, so it costs more.
  25  |   await expect(page.getByText(/moved to Dec \d+, \d{4}\. You pay \$[\d,.]+ in total \(\+\$[\d,.]+\)/).first()).toBeAttached();
  26  | });
  27  | 
  28  | test('a Lincoln claim arrives live, survives a reload, and an underpaid one drafts a message', async ({ page }) => {
  29  |   await page.goto('/?demo=1');
  30  |   await page.getByRole('button', { name: 'Fire mock claim' }).click();
  31  |   await expect(page.getByText('New EOB')).toBeVisible();
  32  |   await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible();
  33  |   await page.reload();
  34  |   await expect(page.getByText(/Matches Ting's estimate/)).toBeVisible(); // replayed from the server
  35  |   await page.getByRole('button', { name: 'Underpaid EOB' }).click();
  36  |   await expect(page.getByText(/EOB says you owe/)).toBeVisible();
  37  |   await page.getByRole('button', { name: 'Draft a message to Lincoln' }).click();
  38  |   await expect(page.getByText(/Hello Lincoln Member Services/)).toBeVisible();
  39  | });
  40  | 
  41  | test('typed intake in Spanish finds the crown on #19', async ({ page }) => {
  42  |   await page.goto('/treatment');
  43  |   await page.getByPlaceholder(/Root canal on #19/).fill('me van a poner una corona en la muela de abajo izquierda, reemplazando la vieja');
  44  |   await page.getByRole('button', { name: 'Find procedures' }).click();
  45  |   await expect(page.getByText(/Found 1 item/)).toBeVisible();
  46  |   // Winnow reads "reemplazando la vieja" with high confidence, so the engine may not need to ask.
  47  |   await expect(page.getByText(/Crown \(porcelain\) on #19/).first()).toBeVisible();
  48  | });
  49  | 
  50  | test('treatment-plan photo is read by Textract into five items', async ({ page }) => {
  51  |   await page.goto('/treatment');
  52  |   await page.getByLabel('Upload a photo of your treatment plan').setInputFiles('public/samples/treatment-plan.png');
  53  |   await expect(page.getByText(/found 5 items/)).toBeVisible({ timeout: 30_000 });
  54  | });
  55  | 
  56  | test("a dentist's bill above the EOB is flagged", async ({ page }) => {
  57  |   await page.goto('/treatment?demo=1');
  58  |   await page.getByRole('button', { name: 'Fire mock claim' }).click();
  59  |   await page.waitForTimeout(3000);
  60  |   await page.getByLabel('Upload a photo of your treatment plan').setInputFiles('public/samples/invoice.png');
  61  |   const confirm = page.getByRole('button', { name: 'Yes, same visit' });
  62  |   const flag = page.getByText(/Your bill asks for \$412, but Lincoln's EOB says you owe \$200/);
  63  |   await expect(confirm.or(flag)).toBeVisible({ timeout: 30_000 });
  64  |   if (await confirm.isVisible()) await confirm.click();
  65  |   await expect(flag).toBeVisible();
  66  | });
  67  | 
  68  | test('explanations are verified, proved by Automated Reasoning, and switch to Spanish', async ({ page }) => {
  69  |   await page.goto('/treatment');
  70  |   await page.getByRole('button', { name: /Root canal \(molar\) on #19/ }).first().click();
  71  |   await expect(page.getByText('Proved').first()).toBeVisible({ timeout: 30_000 });
  72  |   await expect(page.getByText('Verified').first()).toBeVisible();
  73  |   await page.getByRole('radio', { name: 'es' }).click();
> 74  |   await expect(page.getByText(/\b(pagas|tu plan|el plan)\b/i).first()).toBeVisible({ timeout: 45_000 });
      |                                                                        ^ Error: expect(locator).toBeVisible() failed
  75  | });
  76  | 
  77  | test('dentist map shows every practice on OpenStreetMap', async ({ page }) => {
  78  |   await page.goto('/dentists');
  79  |   const map = page.getByRole('region', { name: 'Map of nearby dentists' });
  80  |   await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible();
  81  |   await expect(map.locator('path.leaflet-interactive')).toHaveCount(13); // 12 dentists + you
  82  | });
  83  | 
  84  | test('share link shows the same plan on another device', async ({ page, browser }) => {
  85  |   await page.goto('/treatment');
  86  |   await page.getByRole('button', { name: 'Share with my dentist' }).first().click();
  87  |   const link = page.locator('a[href*="/share/"]').first();
  88  |   await expect(link).toBeVisible();
  89  |   const url = await link.getAttribute('href');
  90  |   const other = await browser.newContext();
  91  |   const dentist = await other.newPage();
  92  |   await dentist.goto(url!);
  93  |   await expect(dentist.getByText(/This link expires/)).toBeVisible();
  94  |   await expect(dentist.getByText('Dale').first()).toBeVisible();
  95  |   await other.close();
  96  | });
  97  | 
  98  | test('works offline: the engine and intake answer in the browser', async ({ page, context, browserName }) => {
  99  |   await page.goto('/treatment');
  100 |   await expect(page.getByText(/What you'll pay/)).toBeVisible();
  101 |   // Let the service worker install and cache the shell.
  102 |   await page.waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration())?.active, null, { timeout: 15_000 });
  103 |   if (browserName !== 'webkit') {
  104 |     await page.reload(); // a returning visitor: the service worker now controls the page
  105 |     await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 });
  106 |   }
  107 |   await context.setOffline(true);
  108 |   await page.getByPlaceholder(/Root canal on #19/).fill('cleaning and x-rays');
  109 |   await page.getByRole('button', { name: 'Find procedures' }).click();
  110 |   await expect(page.getByText(/Found 2 items/)).toBeVisible();
  111 |   // Playwright's WebKit can't reload through a service worker while emulating offline ("internal error");
  112 |   // real Safari can. The offline reload is checked in Chromium.
  113 |   if (browserName !== 'webkit') {
  114 |     await page.reload();
  115 |     await expect(page.getByText(/Your treatment/)).toBeVisible();
  116 |   }
  117 |   await context.setOffline(false);
  118 | });
  119 | 
  120 | test('member sign-in: consent screen, then the member record', async ({ page }) => {
  121 |   await api('/me/delete', { method: 'POST', body: '{}', token: await idToken('member') });
  122 |   await signInAs(page, 'member');
  123 |   await page.goto('/');
  124 |   await expect(page.getByRole('dialog', { name: 'Before you start' })).toBeVisible();
  125 |   await page.getByRole('button', { name: 'I agree' }).click();
  126 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  127 |   await expect(page.getByRole('button', { name: /Member · Sign out/ })).toBeVisible();
  128 | });
  129 | 
  130 | test('a signed-in member shares with a fresh sign-in (step-up passes)', async ({ page }) => {
  131 |   await signInAs(page, 'member');
  132 |   await page.goto('/treatment');
  133 |   await page.getByRole('button', { name: 'Share with my dentist' }).first().click();
  134 |   await expect(page.locator('a[href*="/share/"]').first()).toBeVisible();
  135 | });
  136 | 
  137 | test('employer admin sees server aggregates; a member is refused', async ({ page }) => {
  138 |   expect((await api('/admin/insights', { token: await idToken('member') })).status).toBe(403);
  139 |   await signInAs(page, 'employer_admin');
  140 |   await page.goto('/admin');
  141 |   await expect(page.getByText('Employer insights')).toBeVisible();
  142 |   await expect(page.getByText(/Showing the public sample/)).toHaveCount(0);
  143 |   await expect(page.getByText(/2 groups hidden/)).toBeVisible();
  144 | });
  145 | 
  146 | test('Lincoln analyst approves submitted plan rules', async ({ page }) => {
  147 |   const plans = await (await api('/plans')).json();
  148 |   await api('/rules/submit', { method: 'POST', body: JSON.stringify({ rules: plans[0], evidence: {}, source: 'e2e' }) });
  149 |   await signInAs(page, 'lincoln_analyst');
  150 |   await page.goto('/analyst');
  151 |   await page.getByRole('button', { name: 'Approve version' }).first().click();
  152 |   await expect(page.getByText(/Approved as PLAN-/)).toBeVisible();
  153 | });
  154 | 
  155 | test('judge QR page and calibration chart render', async ({ page }) => {
  156 |   await page.goto('/try');
  157 |   await expect(page.getByRole('img', { name: /QR code/ }).locator('svg')).toBeVisible();
  158 |   await page.goto('/calibration');
  159 |   await expect(page.getByText(/labelled examples/)).toBeVisible();
  160 | });
  161 | 
```