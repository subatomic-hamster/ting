// Hackathon data collection. Authorization was confirmed by the project owner on 2026-10-04.
// Uses the published consumer workflow and stops on access limits; never retries around them.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const zip = process.argv.find((arg) => /^--zip=/.test(arg))?.split('=')[1] ?? '27401';
if (!/^\d{5}$/.test(zip)) throw new Error('Use a five-digit ZIP: --zip=27401');
const output = new URL('../src/data/dental-resources.json', import.meta.url);
const previous = await readFile(output, 'utf8').then(JSON.parse).catch(() => undefined);
if (previous?.fairHealth.status === 'access-limited') {
  console.log('Saved FAIR Health access limit: no further requests made. Obtain the event-approved data feed or have access restored by the provider.');
  process.exit(2);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const collectedAt = new Date().toISOString();
const libraryUrl = 'https://ohl.go2dental.com/oral-health?cli=lincoln&sm=5';
const report = {
  collectedAt, zip,
  authorization: 'Project owner confirmed hackathon permission on 2026-10-04; no dataset or special access endpoint supplied.',
  library: { url: libraryUrl, status: 'pending', articles: previous?.library.articles ?? [] },
  fairHealth: { url: 'https://www.fairhealthconsumer.org/dental/category', status: 'pending', estimates: [], uncollectedCodes: [], evidence: '' },
};
try {
  await page.goto(libraryUrl, { waitUntil: 'domcontentloaded' });
  const links = await page.locator('a[href*="content?"]').evaluateAll((nodes) => nodes.map((a) => ({ title: a.textContent.trim(), url: a.href })).filter((a) => a.title));
  if (!links.length) {
    report.library.status = /Just a moment|Verify you are human/.test(await page.title()) ? 'challenge' : 'no-articles';
  } else {
    report.library.status = 'collected';
  }
  const seen = new Set();
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    const response = await page.request.get(link.url);
    if (!response.ok()) throw new Error(`Library request failed (${response.status()})`);
    // Parse privately in the browser; retain titles, dates and presence of amounts, not full copyrighted articles.
    const facts = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const body = doc.body.textContent.replace(/\s+/g, ' ');
      return { title: doc.querySelector('h2')?.textContent.trim(), updated: body.match(/Last updated:\s*([\d/]+)/)?.[1] ?? null, hasDollarAmounts: /\$\s*\d/.test(body) };
    }, await response.text());
    const priorArticle = report.library.articles.find((a) => a.url === link.url);
    report.library.articles = report.library.articles.filter((a) => a.url !== link.url);
    report.library.articles.push({ ...link, ...facts, codes: priorArticle?.codes ?? [] });
  }
  console.log(`Library: ${report.library.articles.length} articles checked; ${report.library.articles.filter((a) => a.hasDollarAmounts).length} contain dollar amounts.`);

  const cdt = await readFile(new URL('../src/engine/cdt.ts', import.meta.url), 'utf8');
  const codes = [...new Set([...cdt.matchAll(/^  (D\d{4}):/gm)].map((m) => m[1]))];
  // Start with the major-restorative code used in every demo scenario.
  codes.sort((a, b) => Number(b === 'D2740') - Number(a === 'D2740') || a.localeCompare(b));
  report.fairHealth.uncollectedCodes = [...codes];
  await page.goto('https://www.fairhealthconsumer.org/dental', { waitUntil: 'domcontentloaded' });
  await page.locator('#location').fill(zip);
  await Promise.all([page.waitForURL('**/dental/category'), page.locator('.step2Btn a.next').click()]);
  for (const code of codes) {
    await page.goto('https://www.fairhealthconsumer.org/dental/category', { waitUntil: 'domcontentloaded' });
    await page.locator('#care-code').fill(code);
    await page.locator('.careCodeBtn').click();
    await page.waitForFunction(() => location.pathname.includes('/search/') || document.querySelector('#consumerUse.show'));
    if (await page.locator('#consumerUse.show').count()) await page.locator('button.agree').click();
    await page.waitForURL('**/dental/search/**');
    await page.locator('label').filter({ has: page.locator(`#pc-${code}`) }).click();
    const resultContent = page.waitForResponse((r) => r.url().endsWith('/dental/resultscontent'));
    await page.getByText('Get your cost', { exact: false }).click();
    await page.waitForURL('**/dental/results');
    const dataResponse = await resultContent;
    if (!dataResponse.ok()) throw new Error(`Results unavailable (${dataResponse.status()})`);
    await page.waitForFunction(() => /Search Limit Exceeded/i.test(document.body.innerText) || document.querySelector('.percentile-slider')); 
    const body = await page.locator('body').innerText();
    if (/Search Limit Exceeded/i.test(body)) {
      report.fairHealth.status = 'access-limited';
      report.fairHealth.evidence = `Search Limit Exceeded on ${code}, ZIP ${zip}. Provider billed charge and combined allowed amount returned N/A. Collection stopped; unavailable amounts were not converted to zero.`;
      await mkdir(new URL('../docs/pricing-evidence/', import.meta.url), { recursive: true });
      await page.screenshot({ path: new URL('../docs/pricing-evidence/fair-health-limit.png', import.meta.url).pathname, fullPage: true });
      break;
    }
    // Retain only observed percentile-price pairs. The current site labels its allowance as BOTH network types.
    const sliders = await page.locator('.percentile-slider').evaluateAll((nodes) => nodes.map((node) => ({
      label: node.querySelector('.slider-header')?.textContent.trim(),
      percentile: node.querySelector('.pct-label.active')?.textContent.trim(),
      price: node.querySelector('.price-bubble')?.textContent.trim(),
    })));
    const observed = sliders.filter((s) => /^\$[\d,]+(?:\.\d{1,2})?$/.test(s.price ?? '') && /^\d+th$/.test(s.percentile ?? ''));
    if (!observed.length) {
      report.fairHealth.status = 'unavailable';
      report.fairHealth.evidence = `No verifiable numeric estimate rendered for ${code}. Stopped without substituting zero or guessing.`;
      break;
    }
    report.fairHealth.estimates.push({ code, zip, url: page.url(), sliders: observed, inNetwork: null, outOfNetwork: null,
      note: 'Observed benchmarks only. Combined allowed values must not be treated as contracted in-network fees or insurer-specific UCR.' });
    report.fairHealth.uncollectedCodes = report.fairHealth.uncollectedCodes.filter((c) => c !== code);
    report.fairHealth.status = 'collected';
  }
} catch (error) {
  report.fairHealth.status = report.fairHealth.status === 'access-limited' ? 'access-limited' : 'error';
  report.fairHealth.evidence ||= String(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`FAIR Health: ${report.fairHealth.status}; ${report.fairHealth.estimates.length} estimates. Saved ${output.pathname}`);
  await browser.close();
}
