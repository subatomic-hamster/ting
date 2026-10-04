# Mobile revamp acceptance checklist

Prepared October 4, 2026 after reading all of [design.md](../design.md) and the existing [mobile teardown](mobile-ux-review.md). Review-only implementation guidance; no application files changed. This checklist supplements the design brief. It does not certify the unfinished rebuild.

## Governing rules

Section 0 of design.md overrides the marketing reference's 15px body text, 42px inputs, 44px controls, huge photo heroes and long directory/legal footers. Apply the mobile product requirements to every member route, including deeper states and overlays:

- [ ] Compact own-brand header, 64–70px tall. Member navigation is discoverable and shows the current destination. Partner/debug/demo destinations live in a separate menu.
- [ ] White main surface, #650030 burgundy emphasis, readable dark text, fine gray dividers, square/subtle 2px corners. No heavy shadows, gradients, pill clusters or nested pale-card stacks.
- [ ] Lightweight licensed serif title at 32/38, section title 22/28, card title 20/26, result 32/38. Body/input/form label/action text at least 16/24; useful secondary 14/20; 12/18 only incidental reference/legal content.
- [ ] At 390px the main inset is 20px; at 320–375px, 16px. Use about 32px section separation, 40px at major context changes. Keep layouts naturally sized when text wraps.
- [ ] Every operable target has a 48px hit region. Checkbox/radio labels supply that region; a decorative icon can remain smaller. No adjacent tiny destructive actions.
- [ ] The first 390 × 844 screen explains location, main task/result, scope/uncertainty and a concrete next action. One filled dominant action per task state; alternatives are clearly secondary.
- [ ] No decorative verification/proof/confidence/model/performance/trace badges. Internal validation stays enabled. No new UI em dashes. No redundant disclaimer under each amount.
- [ ] A single consistent sample-session notice is readable near the top. Specific unknown-price assumptions remain adjacent to affected totals. Technical source names/hashes are optional details, not patient reassurance.
- [ ] Underlying calculations, validated intake, allowed-date constraints, claims handling and document source evidence remain intact. UI totals still come from the engine.
- [ ] No production asset/copy/font is copied from the reference identity. Use Ting's own identity; keep docs/design-reference outside public output. Prefer “your insurer” in ordinary product copy over brand-derived marketing language.

## Route-by-route blueprint and completion gate

| Route | Main task/result and recommended anatomy | Preserve and prove |
|---|---|---|
| `/` | Short greeting → next needed visit/action → estimate with period and sample context → one “Review treatment” action → concise max/deductible/FSA rows → optional activity/reminders/habits. Avoid making the gauge the whole story. | Plan switching, latest claims, balances, reminders, Ask and habit access remain reachable. A zero-treatment state invites adding actual work, not a fabricated recommendation. |
| `/treatment` | Estimated total + schedule context → readable visit rows → tap-selected visit detail → timing choice → export/share action. Put add/upload treatment in an expandable task region after first use. | Text/voice/photo/PDF intake, uncertainty questions, same-visit groups, deadlines/dependencies, locked urgent visits, edits/removal, in/out scenario, engine breakdown and calendar/share remain functional. |
| `/enroll` | Plan/year + estimated comparison total + close-call/uncertain assumptions → one concrete preparation/export action → stacked options → maybe/FSA details. Say “recommended” rather than implying enrollment was submitted. | Show current and proposed plans distinctly. Card, export, share and reminders consume the same recommendation. Probabilities, tipping points, premiums, FSA election and carryover remain explainable. |
| `/dentists` | Location/sample status → applicable cost for current dentist → readable ranked provider rows → provider detail/contact or honest demo action. List/map toggle rather than a map below twelve cards. | Network/availability/distance remain visible; pinning clearly means pinning. Do not claim verified price, booking or phone contact from synthetic records. Counterfactual network prices live in details. |
| `/email` | One clearly explained document intake route → delivery status → private-by-default alert settings → received/sent records. Disconnected mode leads with a sample/upload action. | Sender approval, held messages, invoice reconciliation, forwarding copy, settings, message details and outbox remain reachable. Two distinct addresses need explicit purposes. Empty states only follow successful requests. |
| `/habits` | Reward amount/current goal → brush/session connection → concise streak with visible dates → optional program explanation/sharing settings. Remove personalized clinical-risk recommendations. | Opt-in/out, device error/disconnect, live session, history/rewards, dentist share opt-in and aggregate share opt-in work. Deletion and revoked sharing survive reload. No invisible “never sees” privacy column. |
| `/plan` | Current plan identity/year → human-readable coverage rows → one upload/select-plan action → extraction preview/source details → unresolved answers → member confirmation/admin-review distinction. | Benefits-summary upload, insurance card scan, source evidence, missing-rule questions, review submission and use-as-current/enrollment option work. Confirmation must not impersonate insurer approval. |
| `/onboarding` | One useful question at a time with readable choices, step status and Next/Back. Remove unused family question or implement member ownership. End with intake review. | Previous answers survive Back; “Not sure” stays uncertain. Do not add duplicate/unrequested cleanings. No silent finishing error. Only add reviewed procedures to the profile. |
| `/share/:token` | Patient/snapshot identity and date → readable ordered visits → dentist questions → explicitly opted-in home-care summary → export/print. No app nav required. | Valid snapshot uses its own immutable data. Invalid/expired/error states never render substitute persona data. Rows reflow on mobile; optional demo label matches actual data source. |
| `/try` | Short own-brand demo introduction → QR/link with a useful destination. | QR and text link encode the same correct app URL; no research art, reference identity or unreachable CTA. |
| `/auth/callback` | Readable signing-in / failed-sign-in state. | Error/retry preserves destination; login does not strand users. Consent modal is accessible and cannot look like a completed deletion if state remains. |

Shared-shell changes also affect `/admin`, `/program`, `/record`, `/analyst` and `/calibration`. Keep those routes available through a separate audience menu; a member-first redesign must not remove the demonstration or analyst workflows. Their technical metadata can remain in genuinely professional/debug contexts.

## Release-blocking behavior regressions

These are concrete checks against the previous report, not cosmetic acceptance:

- [ ] **Recommendation/export agreement:** select Fastest on Treatment, then Enroll. The card's January target dates and chosen-plan costs appear identically in downloaded `.ics` and the created dentist snapshot. A current treatment export remains explicitly distinguished.
- [ ] **State durability:** add treatment, edit a date/network scenario, remove a visit, reload and reopen. User work/deletions survive, or the interface clearly says the action is temporary before doing it. Do not report “Saved” for memory-only state.
- [ ] **Privacy durability:** opt out/delete SmileStreak; reload. Sessions remain cleared, consent remains revoked, and share snapshots do not silently re-enable collection. A deliberate demo reset is the only operation allowed to reseed sample history.
- [ ] **Invalid share:** typo token, missing token record, expired snapshot and server outage produce distinguishable useful errors, with no Dale/other fallback record or unrelated home-care summary.
- [ ] **Replacement uncertainty:** “replacing the old crown” does not create an exact prior date. Ask for a date/year when meaningful; unknown stays unknown with a clear coverage assumption.
- [ ] **Family truthfulness:** a family answer either creates per-member data/limits or explains unsupported scope; otherwise remove it. No unused “personalizing” question.
- [ ] **No unsupported clinical forecast:** adherence does not rewrite the likelihood of root canals or other treatments. Preserve dentist-supplied uncertainty and financial sensitivity tools.
- [ ] **Tap scheduling:** a touch user can open a visit, choose an exact allowed date, see estimated effect and save/cancel. Lock/dependency/deadline failures explain why and preserve input. No precision drag or hardware keyboard is required.
- [ ] **Recoverable failure:** Ask, upload, email settings, sender approval, reminders, plan review, share creation and clipboard each have task-specific visible failure/retry. Failed fetch does not say “Nothing yet.”
- [ ] **Private defaults:** new/unknown contact settings initialize to private, loading cannot overwrite a dirty form, and details require deliberate opt-in.
- [ ] **Removal recovery:** removal provides Undo and preserves/restores related visit/dependency state; the correction path is no harder than deletion.
- [ ] **Truthful actions:** creating a share link never says it was sent; downloading a calendar never says it was imported; a mock contact action never says a visit was booked.

## Independent review matrix

Run the new app only after the implementing agent identifies a stable ready-for-review point. Capture the exact build/commit or working-tree snapshot and mock/live configuration. Keep failures separate from unsupported integrations.

| Coverage | Required checks |
|---|---|
| 320, 375, 390, 430px | Every member/public route; selected visit detail; expanded breakdown/source details; intake review; missing allowance; maybe controls; nav open; share/error states; empty states. No whole-page overflow or clipped required amounts/actions. |
| 768px | Compact header and coherent layout; no premature desktop table that hides data; natural reflow and touch-size controls. |
| 200% text | At least 320, 390 and 768px with enlarged text while maintaining viewport. Text wraps, fields/actions grow, labels/errors remain associated, footer/dialogs remain reachable. Report a synthetic text-enlargement harness as simulation, not native phone text settings. Do not call deviceScaleFactor or screenshot magnification text zoom. |
| Keyboard / overlays | Logical focus order; active nav state; Escape/click-away where appropriate; focus contained in modal, background inert, focus restored on close; date editor usable by keyboard. |
| Chromium + mobile WebKit | Critical intake/date/enrollment/share journeys and layout smoke. Inspect console errors, failed requests and blank screens. Physical camera/voice/Bluetooth and native calendar import stay explicitly unverified unless actually exercised. |
| E2E documents | Sample treatment photo/PDF, insurance card and summary uploads; questions/review/add; invoice reconciliation and claims-driven recalculation. Test visible outcomes, not just successful API responses. |
| Functional integrity | Existing unit/engine checks, typecheck/lint/build, member route E2E and smoke of separated analyst/employer routes. Preserve all user-owned edits. |

Suggested measurement harness: record route/viewport, document and viewport width, visible control hit-region bounds, font sizes for task text/inputs, heading hierarchy and console failures. Inspect screenshots at full resolution. Automated dimensions can flag violations; they cannot determine which text is incidental or whether a CTA is meaningful.

For 200% text simulation, snapshot computed font sizes and numeric line heights before applying doubled text styles, then test reflow without changing viewport width. Do not repeatedly multiply inherited styles or enlarge just the root when fixed-pixel rules remain unchanged. Native browser text-only zoom/phone accessibility settings are preferable when available; state which method was used.

## Implementation shortcuts to avoid

- Do not globally hide small-text elements: that removes uncertainty, deadlines or errors instead of redesigning them.
- Do not globally remove all pills/badges with CSS: replace meaningful status with a plain readable sentence and preserve semantic state.
- Do not turn every table into a horizontal scroll container: use stacked records for plan, audience privacy, dentist and handoff data.
- Do not reuse active treatment state for next-plan exports merely because a shared component accepts no recommendation prop.
- Do not make one frozen primary button dominate all routes: primary action is based on task state (add, review, save date, prepare plan, retry).
- Do not claim full E2E completion from visual screenshots, mocked API return values or an engine test alone. Verify the user-visible journey and durable outcome.
