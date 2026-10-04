# Dental pricing source audit

Reviewed October 4, 2026 for sample ZIP **27401 (Greensboro, NC)**. The project owner confirmed hackathon permission for data collection in this chat. No event-specific dataset, credentials or alternate data endpoint was supplied.

## Result

**The two hackathon resources yielded no verified numeric prices. Follow-up research collected 101 published FY2026–27 clinic charges, with 14 suspect/local-code rows quarantined. These are provider charges, not insurer rates or regional percentiles. Existing demo amounts remain labeled synthetic.**

See the [pricing/procedure implementation brief](pricing-procedure-handoff.md) for the current sources, 137-procedure catalog, braces scope and required insurer feed. The guarded PDF extractor is `scripts/extract-provider-fees.py`; it verifies the reviewed source SHA256 and expected codes/amounts before writing a candidate dataset.

- [Lincoln dental health library](https://ohl.go2dental.com/oral-health?cli=lincoln&sm=5): reviewed 11 relevant procedure articles through public web retrieval. They provide education, procedure distinctions and questions for a dentist, but the reviewed articles contain no dollar amounts or insurer fee schedules. Direct browser/HTTP automation encountered a Cloudflare challenge; no challenge bypass was attempted. The article titles, URLs and corresponding app codes are in `src/data/dental-resources.json` and are linked from the treatment breakdown.
- [FAIR Health dental estimator](https://www.fairhealthconsumer.org/dental/category): followed the site's ZIP → code search → procedure selection → cost workflow. The calculator returned **Search Limit Exceeded**, with **N/A** cost values. Collection stopped at the limit; no rotating identities, alternate IPs, CAPTCHA bypass or restricted backend access was used. Early page shells were not accepted as numeric results. All 50 app codes remain without verified source prices.
- The rendered dental calculator labels its two fields **Provider Billed Charge** and **Allowed Amount (Includes Both In-Network and Out-of-Network Amounts)**. A combined allowed benchmark cannot be substituted for a contracted in-network fee, an out-of-network insurer allowance or the member's final payment.

[Access-limit evidence](pricing-evidence/fair-health-limit.png). The machine-readable audit is `src/data/dental-resources.json`.

## Corrections implemented

1. Removed the general UCR multiplier. The engine now looks up an explicitly supplied amount for the exact percentile. It never derives a missing percentile from the dentist's billed amount or a different percentile.
2. Separated a plan's **MAC** amount from its in-network fee. Missing MAC data remains missing.
3. Preserved the existing worked-example amounts as an explicitly **synthetic fixture** in `src/data/demo-fees.json`. Those fixture UCR and MAC amounts remain invented sample values; moving them into an explicit table does not make them market observations. The existing demo scenarios retain their dollar totals.
4. Added fee and allowance provenance, including a distinct source for a fee supplied in treatment details. Changing network also changes the allowance source.
5. When an allowance or necessary alternate-benefit amount is unavailable, the engine budgets the full fee with a pending-confirmation warning. It does not assume reimbursement on the entire bill, consume the deductible/max or call the missing data a coverage denial. Zero benefit fields in that provisional calculation mean **unconfirmed reimbursement**, not a scraped zero-dollar allowance. The warning travels with the adjudicated line and typed cost answers.
6. The treatment breakdown labels sample prices, distinguishes them from a dentist quote, and links procedure education and local cost lookup. Explanations call demo/estimated in-network fees what they are, rather than presenting them as confirmed carrier contracts.

## To replace the sample figures

The remaining dependency is provider-restored access or an event-approved fee feed/download. The scraper preserves the saved access-limit result and refuses automatic repeat requests while that result is present.

For each priced code obtain:

- The procedure variant and unit (tooth, surface, quadrant, arch, or time interval).
- Geography, source date and charge percentile, retaining unavailable values as missing.
- A billed quote, independently of any geographic charge benchmark.
- The carrier/provider's actual contracted fee or an explicitly labeled network estimate.
- The plan's out-of-network allowance basis and the **exact** referenced UCR percentile or MAC schedule amount.

Load those verified values into `Profile.fees` and retain source metadata; existing procedure-level `fee`/`allowedFee` overrides must also be updated deliberately so they do not shadow the new table. A global discount percentage cannot replace these data. FAIR Health benchmarks are estimates, and actual insurer reimbursement still depends on the plan, deductible, maximum, frequency limits and coverage.

The collector is `scripts/scrape-dental-resources.mjs`; use `node scripts/scrape-dental-resources.mjs --zip=27401` after the provider supplies a working access route. It stops on access limits or unverifiable amounts and never converts N/A into zero. Its future unblocked collection path has not been verified because the source currently denies access.

## Validation

Pricing regression tests cover exact UCR lookups, independent MAC amounts, balance billing, quote caps, missing allowances without cap/deductible use, missing alternate-benefit data and quoted-fee provenance. The existing worked-example tests remain in place.
