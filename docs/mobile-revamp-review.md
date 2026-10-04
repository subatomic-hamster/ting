# Independent review of the mobile rebuild

October 4, 2026. Review-only: application files were not modified. The implementation was changing while this review ran; the initial sweep and subsequent recheck are separate checkpoints. This is a UX acceptance review of the local mock application, not a production/live-account certification.

## Coverage and result

- Exercised **two sweeps of 88 layout combinations** (176 total): 11 member/public routes at 320/375/390/430/768px, plus doubled-text simulations at 320/390/768px.
- Routes: Home, Treatment, Enroll, Dentists, Email, SmileStreak, Plan rules, Onboarding, invalid share, Try and auth callback. Also exercised a valid created share and expanded cost/source/date states.
- **No document-level horizontal overflow or page exception** in the initial closed-state sweep. Expanded Treatment at 320px with doubled text also kept document width at 320px. Native mobile WebKit Treatment at 375px had no page overflow.
- Text stress used snapshotted computed font sizes/line heights doubled at fixed viewport dimensions. This is a text-enlargement simulation, not a physical phone accessibility setting or a screenshot magnification.
- Shared titles are 32/38px; body/inputs are readable 16px and useful secondary text is 14px in the checked member pages. The new styling/navigation substantially follows Section 0 of design.md.
- **Do not equate the default-state sweep with complete acceptance:** a later opt-out/device-connection state exposed overflow at 320px with doubled text. That state now passes a focused recheck; removal recovery and dated brushing history also passed separate interaction checks.
- Final local review found no remaining P1 mobile workflow blocker in the exercised journeys. Remaining review suggestions concern precise export/share labels and the two email addresses. Live authentication, physical-device integrations and native imports remain outside this review's verification.

Raw evidence: [initial layout observations](mobile-revamp-review-evidence/layout-observations.json), [latest layout observations](mobile-revamp-review-evidence/layout-observations-latest.json), [latest focused recheck](mobile-revamp-review-evidence/late-recheck-observations.json), [interaction observations](mobile-revamp-review-evidence/interaction-observations.json), [subsequent recheck](mobile-revamp-review-evidence/recheck-observations.json), [final recovery/history recheck](mobile-revamp-review-evidence/final-state-recheck.json), [final deletion-copy/opt-out recheck](mobile-revamp-review-evidence/final-privacy-recheck.json).

## Verified fixes to the previous teardown

| Previous defect | Independently observed result |
|---|---|
| Enrollment exports current treatment dates rather than the recommendation | Selected Fastest first; actual downloaded `.ics` and created handoff use the recommended January crown dates. Source also passes the recommended schedule into sharing/reminders. |
| Removing a treatment is reversed by reload | Removed crown #30: five procedures before and after reload. |
| SmileStreak deletion/revoked sharing is reversed by reload | Zero sessions and all consent/sharing flags false before and after reload. |
| Invalid share token fabricates a patient record | Invalid token now shows unavailable/retry state, with no substitute Dale handoff. |
| Ignored family question and automatic cleaning | Replaced with explicit one-person scope and reviewed intake; no automatic cleaning from a fabricated history answer. |
| Invented prior-crown placement date | Source now asks for a previous date and carries unknown history as an uncertainty; no hardcoded 36-month record. |
| Adherence silently changes clinical treatment probability | Patient card now expressly states that brushing does not predict treatment need; links to financial uncertainty review. |
| Dragging is required to select dates | Readable date rows and Apply actions now exist. After the review found a 90px field at 200% text, the refinement gives a full-width 288px field with a readable 32px date. |
| Ask diagnostic/confidence metadata and silent error | Recheck shows only the answer; source has a visible retry-oriented error. |
| Plan coverage/approval presented as technical proof | Recheck finds zero coverage tables; source uses member confirmation language and removes fingerprint/probability decorations. |

### New catalog defect found and fixed during review

Filtering the default adult-braces selection to “root canal” initially caused the select to display a root-canal option while the underlying form still used braces. This could submit the wrong procedure. The implementing agent changed filtering to clear incompatible selection and hide the form.

**Recheck:** selected value is empty, form count zero after filtering; explicitly choosing D3330 and adding a quoted $1,500 procedure produces D3330. [Initial mismatch evidence](mobile-revamp-review-evidence/catalog-search-mismatch.png). Retain a regression check for search/filter/selected-code agreement.

## Findings identified during the review and their latest status

The implementing agent addressed findings 1–4 below during this review. Latest focused checks confirm: no SmileStreak tables, correctly stated two-year cost scope, calendar primary action at y≈599px on 320px, no enrollment em dash, intake/catalog closed by default, correct explicit catalog selection, and map zoom at 48 × 48px. Evidence for the original problems is retained below. Remaining items and privacy/consent findings are separated at the end.

### 1. Resolved after recheck. P2: SmileStreak still conceals costs and labels a two-year total as next year

**Reproduce:** Open SmileStreak → Next year, with your credit. It still renders a 420px minimum table with the Net column off-screen on a phone. Its “Expected cost next year” is `useComparison().options[].total`, the same total Enrollment describes as the current and next year combined.

**Impact:** Incorrect time scope plus a hidden net amount undermines the financial decision. This violates the design brief's rule against hiding critical columns in horizontal scrollers.

**Fix:** Convert options to stacked label/value records. Either compute next-year-only cost or label the current two-year comparison scope explicitly. Put the applicable reward period beside its amount.

**Source:** `src/components/habits/NextYearCard.tsx:8`, `:14`, `:18`; `src/pages/Habits.tsx:58`. [Initial 390px evidence](mobile-revamp-review-evidence/habits-390-1x.png).

### 2. Resolved after recheck. P2: Enrollment's next action remains below the full checklist

**Reproduce:** At 320 × 844, visit Enroll with seven treatment items after adding one quoted root canal. Calendar action begins about **1,349px below the viewport top**. The first viewport is heading, recommendation, amount and the beginning of the full action checklist.

**Impact:** There is no concrete next action on the first screen, despite that being an explicit acceptance gate. The page feels like instructions to read, rather than a decision ready to act on.

**Fix:** Put the main action immediately after the recommendation/qualification. Move the full treatment checklist into a readable “Recommended dates and FSA details” disclosure. Keep the existing export/share schedule object unchanged.

**Source:** `src/components/EnrollmentCard.tsx:78`, `:80`, `:107`. [320px first viewport](mobile-revamp-review-evidence/enroll-viewport-320.png).

### 3. Resolved after recheck. P2: Treatment still opens an entire intake and catalog inventory by default

**Reproduce:** The initial six-item Treatment screen is **5,298px tall at 390px**. After visit details and date rows, it shows text/photo intake and the complete catalog form, with adult braces preselected and its long clinical/payment qualification visible.

**Impact:** The top of the screen is improved, but returning users still encounter the feature-inventory density that Section 0 explicitly rejects. The default braces form implies work the user has not chosen.

**Fix:** Preserve Add treatment and Browse procedures as clear 48px disclosures/task entry points. Open them when requested, or when treatment is empty. Start the catalog with a deliberate procedure choice. Keep braces payment assumptions visible once a braces procedure is actually chosen.

**Source:** `src/pages/Treatment.tsx:22`; `src/components/ProcedureCatalog.tsx:7`; [initial Treatment full page](mobile-revamp-review-evidence/treatment-390-1x.png).

### 4. Resolved after recheck. P2: Leaflet zoom actions do not meet 48px target width

**Reproduce:** Dentists → Map at 320px. Zoom buttons measure **30 × 48px**. The third-party Leaflet width overrides the shared button/link treatment.

**Impact:** Required map actions remain narrow touch targets. Enlarging only height did not satisfy the 48 × 48 design requirement.

**Fix:** Give map zoom controls and the popup close control explicit minimum 48px hit regions; inspect the popup with doubled text as well. Preserve required attribution as incidental reference text.

**Source:** `src/components/DentistMap.tsx`; Leaflet control CSS. [Map evidence](mobile-revamp-review-evidence/dentist-map-final-320.png).

### 5. Partly resolved. P2: Existing copy still contains avoidable clutter and ambiguous completion language

**Observed:** Enrollment still shows the engine disclaimer containing an em dash; the same card also repeats education/savings qualification ahead of the shared footer. “Share with my dentist” creates a link rather than sending it, and “Add to calendar” downloads an import file. Two email intake addresses remain in the Email page.

**Impact:** These are small individually, but collectively leave the member uncertain about what happened or where to send a document. The design brief explicitly requires one explanation per fact and truthful action labels.

**Fix:** Use “Create dentist share link” and “Export calendar file,” followed by a concise next-step confirmation. Consolidate the disclaimer once; retain the material estimate scope/unknown allowance. Explain the two email addresses' different purposes or choose one primary route in mock mode. Strip em dashes from generated ordinary UI copy without rewriting verbatim optional source quotes.

**Source:** `src/components/EnrollmentCard.tsx:94`; `src/engine/compare.ts` disclaimer; `src/components/DentistQuestions.tsx:44`; `src/pages/Email.tsx:34`; `src/components/ForwardingCard.tsx:52`.

**Latest status:** Enrollment's repeated disclaimer and em dash are removed. “Add to calendar” and “Share with my dentist” still precede file export/link creation, respectively; the explicit action-label suggestions and email-route explanation remain worthwhile refinements, not newly demonstrated data loss or schedule defects.

### 6. Resolved after final interaction recheck. P2: Durable deletion still has no recovery path

**Reproduce/source:** Remove an item with X. The new persistence correctly retains the deletion, but there is still no Undo. The store also removes its references from remaining treatment dependencies.

**Impact:** This is more consequential now that reload cannot restore the item. An accidental tap changes treatment and potentially sequencing.

**Fix:** Provide Undo restoring the removed visit and related dependencies, or a reviewable confirmation for dependent treatment. Preserve the 48px target.

**Source:** `src/components/ProcedureList.tsx:49`; `src/store.ts` `removeProcedure`.

**Latest status:** Undo removal now restores the root-canal visit and its affected dependencies. The restored procedure state also survives reload. Semantic comparison normalizes absent and empty dependency lists, which represent the same sequencing constraint.

### 7. Resolved after final interaction recheck. P2: The brushing calendar remains a grid without visible dates

**Reproduce:** SmileStreak → Streak. Cells show color only. Dates/session counts live in `title` and accessibility labels, with no touch inspection or visible week/day context.

**Impact:** A sighted phone user cannot work out which day was missed. Hover-only inspection was identified in the original teardown and remains unfixed.

**Fix:** Add readable date/week context and tap-to-inspect details, or use a concise dated history list. Do not make 35 tiny cells the only interaction.

**Source:** `src/components/habits/StreakCalendar.tsx:19`, `:24`.

**Latest status:** All 35 days now have visible date buttons. Tapping one announces a dated session/program-goal status. At 320px with doubled text, buttons measure 66 × 112px and the page stays at 320px. [Final dated history](mobile-revamp-review-evidence/streak-final-320-2x.png).

## Additional privacy and clinical-copy checks

### 8. Resolved in the subsequent source/UI recheck. P2: Previously shared home-care snapshots survive “Delete everything”

**Verified reproduce:** Create a dentist share containing the default opted-in home-care summary. Leave SmileStreak and choose Delete everything. Open the previously created share: Home-care summary still appears. Local current sessions/consent are correctly deleted, but the snapshot copy remains.

**Impact:** ConsentCard promises “Leave anytime and everything is deleted.” That promise exceeds the deletion implemented. This is a retention/consent clarity defect, not evidence of unauthorized transfer to another person during this review.

**Fix:** Revoke stored online summaries where supported, or explain that leaving deletes collected sessions and stops future sharing, while existing snapshots remain until their stated expiry. Change the deletion confirmation to match its scope. Do not claim to retract a downloaded/printed copy.

**Source:** `src/components/habits/ConsentCard.tsx:53`; `src/habits/store.ts` optOut; `src/api/mockApi.ts:112`, `:117`. [Share after deletion](mobile-revamp-review-evidence/share-after-habit-delete-320.png).

**Latest status:** Consent and privacy sections now expressly explain that existing summaries remain until link expiry and downloaded copies stay with recipients. The confirmation action is now “Delete sessions and leave.” The scope is accurately represented; the existing snapshots are retained intentionally. Premium/retention wording was also observed in the opt-out UI. [Focused copy recheck](mobile-revamp-review-evidence/final-privacy-recheck.json).

### 9. Resolved in the subsequent source/UI recheck. P2: The opt-in copy contradicts itself about premiums

ConsentCard says “your premium can only go down” and, immediately below, “Your premium or claims are never affected.” The program issues credits rather than changing the stated premium. Replace the safe-driving analogy with the actual reward: brushing/cleaning credits under the sample program. Say clearly that these credits do not change the premium or coverage.

**Source:** `src/components/habits/ConsentCard.tsx:17`, `:39`.

**Latest status:** The opt-in UI now says “Earn program credits without changing your premium or claim decisions,” consistent with the exclusions below it.

### 10. Resolved in the subsequent source recheck. P2: Home-care wording overstates what device evidence can establish

A no-flags summary says “Consistent, even brushing. Nothing stands out.” A pressure threshold generates “Check for gum recession or abrasion.” These rules derive from device counts/time distribution, not a clinical assessment in this repository. The handoff should describe the observed device pattern and invite the dentist to interpret it, without sounding like a clinical finding or all-clear.

**Fix:** “No additional pattern was flagged in these device summaries” and “Discuss frequent pressure alerts with your dentist” retain useful talking points without implying examination or diagnosis. Preserve the visible device-data qualification.

**Source:** `src/components/habits/HomeCareSummary.tsx:16`, `:20`.

**Latest status:** Pressure language now asks the member to discuss recorded warnings/technique. No-flags language explicitly limits the conclusion to available device recordings and states that it is not a clinical assessment.

### 11. Addressed in source; live verification outstanding. P1 source-level gap: sample labeling follows transport mode

AppShell shows the sample-session notice only when `USE_MOCKS` is true. The live backend also supports a public sample persona and synthetic pricing. A live API response does not make those figures verified member data; `PricingNote` now places demo source labels inside a collapsed disclosure.

**Fix/test:** Derive the notice from session/authentication/profile/price provenance. Check the live public sample experience as well as signed-in real-profile state. This review did not exercise the deployed path, so the finding is based on the explicit source condition and repository's supported public-demo behavior, not a new live-site observation.

**Source:** `src/components/AppShell.tsx:16`; `src/components/PricingNote.tsx`; `src/hooks/useBootstrap.ts` live profile path.

**Latest status:** AppShell now bases the notice on mock mode, missing authenticated subject or demo procedure fee provenance. Public live sample sessions therefore retain the sample-account notice, and signed-in users with sample fees receive a specific sample-price warning. The signed-in ConsentDialog source now contains initial focus, Tab containment, focus restoration and visible mutation error messages. These live-account states remain source-reviewed rather than independently exercised against AWS.

### 12. Resolved after final layout recheck. P2: Opt-out device connection state overflows at 320px with doubled text

**Verified reproduce:** SmileStreak → Leave and delete my data → confirm deletion. Double computed text sizes and numeric line heights at a 320px viewport. The device connection fieldset expands to 327px, with its right edge at 343px; document client width is 320px and scroll width is 343px. The initial 176 checks covered the default opted-in state and did not reveal this state.

**Cause/impact:** A device description and a non-shrinking 153px Connect action share one flex row. Fieldset intrinsic sizing expands the document. Enlarged text users must pan the connection action horizontally.

**Fix:** Give the fieldset zero minimum width and stack description/action at narrow widths, allowing wrapping. Recheck the opted-out and device-error states at 320/390px with doubled text.

**Source:** `src/components/habits/DeviceCard.tsx:33`, `:36`, `:48`. [Opt-out enlarged-text evidence](mobile-revamp-review-evidence/consent-final-320-2x.png). The implementing agent has received the exact dimensions and reproduction.

**Latest status:** Device rows stack on mobile and the fieldset has zero minimum width. After leaving SmileStreak, the doubled-text page now has client width, inner width and scroll width all 320px. The linked screenshot was refreshed to the final passing state; the original failure dimensions are preserved in this report.

## Review boundaries

The parent task is running the full engine/build/E2E checks and adding refinements. This review exercised user-visible local journeys and actual mock downloads/snapshots, but did not exercise signed-in AWS accounts, physical camera/voice/Bluetooth, native share-sheet/calendar import, or every injected server failure. Those remain unverified here. Initial screenshots can differ from subsequent improvements; the recheck JSON records the later checkpoint.

Recheck specifically affected states after further changes. The original screenshots document earlier checkpoints, not the final appearance of subsequently edited components.

## Implementer follow-up after independent review

The implementing agent subsequently changed the actions to “Download calendar file” and “Create dentist share link” and explained the two email-address purposes. The final local production E2E suite exercises the renamed export/link actions and email settings. See `revamp-validation.md` for that later checkpoint; it is distinct from the independent reviewer’s original observation.
