# Ting mobile UX teardown

Reviewed October 4, 2026. Review-only: no application files changed. This report includes the pre-existing uncommitted treatment/intake changes. Dollar amounts in screenshots are a frozen review snapshot; pricing work happening in parallel may change them. The parent task is adding fee provenance, explicit synthetic out-of-network allowances and a missing-allowance warning. Those targeted pricing changes were not included in the initial screenshots and do not resolve the schedule/export, state, consent or unsupported-personalization defects identified here.

## Verdict

The app exposes a feature inventory instead of guiding a person through a dental decision. On a phone, the useful recommendation sits below a long stack of cards, the navigation hides member tasks to reserve space for partner screens, and several actions contradict the promises made immediately above them. The most serious problems are behavioral: enrollment exports the wrong schedule, deletion is undone by reload, onboarding asks an unused family question, and an invalid share link renders a convincing substitute patient record.

The AI slop is primarily in the product logic and copy: unearned confidence, probabilities without a defensible explanation, implementation trivia presented as reassurance, and polished promises that exceed the actual workflow. Removing rounded cards or changing colors will not fix those problems.

## Method and limits

- Ran current source with Vite on `http://127.0.0.1:5173`, explicitly using mock mode. Default persona: Dale.
- Rendered Home, Treatment, Enroll, Dentists, Email, SmileStreak, Plan rules and Onboarding in Chromium at 390 × 844; exercised journeys at 375 × 812 and checked narrow layouts at 320 × 740.
- Also rendered Treatment in mobile WebKit at 390 × 844. This is browser emulation, not a real-device keyboard, camera, Bluetooth or screen-reader test.
- Checked actual DOM dimensions, navigation clipping, reload behavior, family onboarding, modal keyboard focus, invalid sharing, habit deletion and enrollment schedule divergence.
- Reviewed source paths for errors, copy and state ownership. Signed-in Cognito consent and live backend failure paths were inspected in source, not exercised against production.
- No whole-page horizontal overflow occurred on the checked 320px member routes. Several essential regions deliberately hide columns/content inside horizontal scrollers; that is a different issue from page overflow.
- Severity: **P1** undermines a core task or trust and should block presenting this as a dependable member workflow; **P2** materially hurts comprehension or mobile use; **P3** lower-priority refinement. These are review priorities, not formal clinical or accessibility certification.

## Priority queue

| ID | Priority | Problem |
|---|---|---|
| R01 | P1 | Enrollment exports and shares a different schedule from its recommendation |
| R02 | P1 | Treatment edits disappear on reload without warning |
| R03 | P1 | SmileStreak deletion and revoked sharing revert on reload |
| R04 | P1 | Invalid share links fabricate a plausible handoff |
| R05 | P1 | Family onboarding asks a question that changes nothing |
| R06 | P1 | Replacement crowns silently get an invented history date |
| R07 | P1 | A brushing heuristic masquerades as a personalized treatment probability |
| R08 | P1 | Mobile scheduling requires precise dragging; no tap alternative |
| R09 | P1 | Essential errors are silent or look like empty data |
| R10 | P1 | Email defaults contradict the promised privacy default |
| R11 | P2 | Navigation conceals member tasks while keeping Partners visible |
| R12 | P2 | No clear next action; recommendations buried in card stacks |
| R13 | P2 | Procedure selection changes a distant panel without a visible relationship |
| R14 | P2 | Network switch rewrites every procedure from an ambiguous global toggle |
| R15 | P2 | Cost labels mix payment, after-tax cost and two-year totals |
| R16 | P2 | Plan recommendation overstates a tiny modeled advantage |
| R17 | P2 | Technical AI/debug metadata crowds the patient interface |
| R18 | P2 | Repetitive waterfall prose adds scroll instead of clarity |
| R19 | P2 | Dentist search is a dead-end list of hypothetical comparisons |
| R20 | P2 | Two competing email addresses create an incoherent intake flow |
| R21 | P2 | Touch targets and form typography are too small |
| R22 | P2 | Privacy, plan and handoff tables conceal important mobile columns |
| R23 | P2 | Modal focus escapes and is not restored |
| R24 | P2 | Tooltips cannot reliably explain terms on a small touch screen |
| R25 | P2 | Rule approval wording implies authority a member action does not provide |
| R26 | P2 | Calendar and sharing fail to explain what actually happened |
| R27 | P2 | Destructive item removal has no undo and strips dependencies |
| R28 | P2 | Onboarding manufactures a cleaning and can swallow failure |
| R29 | P2 | Demo status is fragmented and easy to misread as real personal data |
| R30 | P2 | Benefits-expiry copy pressures use of a maximum rather than needed care |

## Findings

### R01 — P1: The enrollment card does not export the recommendation it shows

**Reproduce:** On Treatment choose Fastest, then open Enroll. The enrollment card tells Dale to move both crowns to January 4, 2027. Its calendar exporter still uses `active.placements`: October 18, 2026 for crown #19 and October 4, 2026 for crown #30. Sharing uses the same active treatment schedule. The card is built from `choice.schedule`, a separately optimized next-plan comparison.

**Impact:** A person can follow the recommendation, tap the obvious handoff button, and send the dentist different dates and current-plan costs. This breaks the product's central promise.

**Source:** `src/components/EnrollmentCard.tsx:17`, `:40`, `:47`, `:50`, `:102`; `src/components/DentistQuestions.tsx:25`, `:32`; `src/engine/compare.ts:221`.

**Remedy:** Make the enrollment card, calendar, dentist snapshot and reminder generation consume one explicit recommended plan/schedule object. Show which plan is assumed and whether it has actually been selected. Keep a separate, clearly labeled action for exporting the current treatment schedule. Regression check: selecting Fastest before visiting Enroll must not change an enrollment recommendation's exported dates.

### R02 — P1: The app loses member edits on reload

**Reproduce:** Remove crown #30 on Treatment. Count falls from six procedures to five. Reload: six return. Added procedures, network changes, chosen plan and custom schedule also live only in an unpersisted Zustand store.

**Impact:** Mobile users switch apps, reload after a stalled connection or reopen a link. Their work silently vanishes, and removed treatment appears again. There is no save status or temporary-session notice.

**Source:** `src/store.ts:118`, `:150`, `:156`, `:221`, `:258`; `src/hooks/useBootstrap.ts:25`.

**Remedy:** Persist the user's working treatment state and deletions with an explicit save indicator. Until persistence exists, disclose the temporary session before editing and provide a durable export. Do not imply that browser-only mutations update the member record.

### R03 — P1: “Delete everything” is reversed by reload, including sharing consent

**Reproduce:** On SmileStreak, select Leave and delete my data, then Delete everything. Sessions become zero and both sharing flags become false. Reload: the default Dale state returns with 537 sessions, opted-in status, dentist sharing and insurer aggregate sharing enabled.

**Impact:** Even in a demo, the UI trains people to distrust the most consequential privacy control. The app presents deleted data as collected again without distinguishing reseeded sample history from a retained record.

**Source:** `src/habits/store.ts:71`, `:90`, `:105`; `src/components/habits/PrivacyControls.tsx:65`, `:71`.

**Remedy:** Persist opt-out/deletion before reporting success. In a sample-only experience, call this “Clear sample history” and ensure reseeding is a deliberate demo reset. Restore consent only through a new opt-in. Verify after reload and in a second tab.

### R04 — P1: Invalid or expired shares show substitute patient information

**Reproduce:** Open `/share/not-a-real-token`. After the share fetch finishes without a snapshot, the page renders “Dale's treatment plan” and a detailed shared home-care summary. It does not say the link failed. The same fallback branch is used for fetch errors.

**Impact:** A dentist receiving a typo, expired or inaccessible link sees a plausible wrong record. This is a correctness/trust defect; the observed data was demo data, not proof of a live cross-member data leak.

**Evidence:** [Invalid handoff screenshot](mobile-ux-evidence/invalid-share-375.png).

**Source:** `src/pages/Share.tsx:28`, `:38`, `:55`, `:60`, `:68`.

**Remedy:** Render separate invalid, expired and temporarily unavailable states. Never substitute a persona or local record when a snapshot lookup fails. Restrict legacy demo reconstruction to a deliberate demo route with conspicuous labeling.

### R05 — P1: The family question is fake personalization

**Reproduce:** Complete onboarding with blank planned work, a recent cleaning and “My whole family.” The resulting profile has the same six Dale procedures and no covered-person/family state. `covered` is only used to enable Next/finish.

**Impact:** The app explicitly explains individual maximums and a shared family deductible, then provides a one-person estimate. That is a materially misleading promise and an unnecessary question.

**Source:** `src/components/OnboardingStepper.tsx:16`, `:21`, `:63`; `src/engine/types.ts` profile model.

**Remedy:** Remove the question until supported, or add actual members, ownership of procedures and per-member limits. State the one-person scope before estimating. A family choice must change the resulting member model or explain why no family estimate is available.

### R06 — P1: “Replacing the old one” invents a crown date

**Reproduce/source behavior:** Intake accepts a replacement answer, then records the prior crown as placed exactly 36 months before the as-of date. The UI never asks when the prior crown was placed and never exposes this fabricated date.

**Impact:** The frequency-limit calculation can deny payment on the basis of a fact the member never supplied. A correct-looking cost breakdown obscures the unsupported premise.

**Source:** `src/components/IntakeBox.tsx:18`, `:119`, `:123`.

**Remedy:** Ask for the placement date or approximate year when it changes coverage, offer “I don't know,” and show the cost range or need for carrier confirmation. Never write a guessed prior service into member history as though it came from the user.

### R07 — P1: A hardcoded habit formula looks like a medical risk estimate

**Reproduce:** SmileStreak tells Dale that meeting the twice-daily goal on 97% of recent days “lowers the odds a bit” and offers “Use 21% instead” for a previously 30%-likely root canal. Applying it changes the cost comparison.

**Impact:** This sounds like a personalized prediction of treatment need. The implementation is a hand-selected linear adjustment, not a model validated in this repository for that clinical use. It risks persuading users to change a financial decision with unsupported precision. This finding evaluates the provenance and representation of the app's own number, not the clinical effectiveness of brushing.

**Source:** `src/habits/analytics.ts:96`, `:100`, `:110`; `src/components/habits/HabitEstimateCard.tsx:50`, `:63`.

**Remedy:** Remove clinical probability changes driven by device adherence. Keep rewards and descriptive habit summaries. If needed for the hackathon, make it an explicitly illustrative sensitivity scenario, separate from the dentist's estimate and default recommendations.

### R08 — P1: Scheduling is designed for a desktop pointer and keyboard

**Reproduce:** At 375px the schedule is an 860px horizontal surface. Instructions offer dragging or arrow/Shift keys. A visit has no tap-to-edit date action; `touch-none` blocks ordinary scrolling when the gesture starts on a chip. Roughly one pixel represents 0.85 days, so choosing an exact date is a precision gesture.

**Impact:** A central mobile task is inaccessible to a user who cannot drag accurately or use a hardware keyboard. Horizontal timeline scrolling and horizontal visit dragging compete for the same gesture.

**Evidence:** [Treatment 375px](mobile-ux-evidence/treatment-375.png), [WebKit 390px](mobile-ux-evidence/treatment-webkit-390.png).

**Source:** `src/components/Timeline.tsx:54`, `:66`, `:124`, `:136`, `:243`, `:251`.

**Remedy:** Use a chronological visit list on mobile. Tapping a visit opens an exact date picker with the allowed range, dentist deadline and cost preview, plus explicit Save/Cancel. Keep dragging as an optional overview interaction. Confirm locked dates with readable inline text.

### R09 — P1: Failure frequently masquerades as an empty or unchanged screen

**Reproduce/source behavior:** Ask has no rendered error state; Email settings Save has no rendered error; Received/Outbox query errors show “Nothing yet”/“No emails sent”; Sharing renders an error only for `step_up`. Plan-review submission has success text but no visible error. Onboarding finishing can fail without navigation or explanation.

**Impact:** Mobile users with flaky connections cannot distinguish no records from failed retrieval, or no effect from failed saving. Repeated taps and duplicate uploads become the natural response.

**Source:** `src/components/AskTing.tsx:18`, `:32`, `:55`; `src/pages/Email.tsx:26`, `:89`, `:97`, `:155`; `src/components/DentistQuestions.tsx:47`; `src/pages/PlanRules.tsx:70`, `:201`; `src/components/OnboardingStepper.tsx:29`.

**Remedy:** Give each fetch/mutation a loading, success, empty and recoverable failure state. Use task-specific messages and Retry. Preserve input after failure. Never use empty-state copy until the request succeeded.

### R10 — P1: Privacy is promised by default, then disabled by default

**Reproduce:** New Email settings initialize `detail: 'detailed'`. “Private mode” is unchecked unless API data changes it. Repository instructions promise detail-free notifications by default. The form is active while the contact query loads.

**Impact:** A user can save detailed medical email settings believing the app has the privacy-first defaults it advertises. A slow response can also overwrite edits through the unconditional form-setting effect.

**Source:** `src/pages/Email.tsx:15`, `:19`, `:22`, `:68`; `CLAUDE.md` Privacy invariants.

**Remedy:** Default to private, require a deliberate opt-in for procedure/dollar detail and disable initialization-dependent controls until load completes. Do not overwrite a dirty form when query data refreshes.

### R11 — P2: Partners wins the navigation space that members need

**Reproduce:** At 375px, the member link container is 255px wide for 518px of links. Email, SmileStreak and Plan rules are initially hidden in a horizontal scroller, while a 96px Partners button remains permanently visible. The nav does not automatically bring the current hidden route into view.

**Impact:** The member cannot discover core tasks or reliably identify the current page. “Partners” is vague and promotes a different audience above their own workflow.

**Source:** `src/components/AppShell.tsx:15`, `:64`, `:101`; [Home screenshot](mobile-ux-evidence/home-390.png).

**Remedy:** Give mobile members a small set of task tabs (Overview, Treatment, Compare) and a clearly marked More menu for documents, dentists, habits and settings. Place employer/insurer views inside an explicit audience switch or demo menu. Ensure current location is always visible.

### R12 — P2: Card stacks flatten every task into the same visual importance

**Reproduce:** At 390px Home is 2,387px high, Treatment 2,825px, Enroll 2,807px, Dentists 3,255px and SmileStreak 3,549px. Treatment's schedule controls come after intake, six procedure cards and a full prose breakdown, about two thousand pixels down. Home leads with a gauge and FSA card rather than a next action.

**Impact:** The decision engine feels like a generated dashboard: many polished containers, little prioritization, no answer to “What should I do next?” A patient returning with one task must search through the whole feature inventory.

**Source:** `src/pages/Dashboard.tsx:50`, `:54`, `:65`, `:69`; `src/pages/Treatment.tsx:46`, `:51`, `:55`, `:77`; `src/components/Section.tsx:26`.

**Remedy:** Lead with a concrete next action and a scoped estimate, then a short visit list. Collapse intake after adding work. Make the selected visit's breakdown optional. Keep a sticky action for the active task; move secondary activity/rewards below a clear section divider. Do not give every metric the same heading/card treatment.

### R13 — P2: Selecting an item updates a distant panel

**Reproduce:** Select a procedure in Your items. Its cost panel changes below the entire list, without scrolling, expansion or focus movement. At 375px, an inspected selection left the detail panel starting about 672px below the viewport top.

**Impact:** A tap looks like a mere highlight and the cost explanation may remain out of view. Users must infer which panel changed and scroll to find it.

**Source:** `src/components/ProcedureList.tsx:30`; `src/pages/Treatment.tsx:22`, `:52`, `:55`.

**Remedy:** Expand the breakdown inside the selected item or open a bottom sheet. Make the whole relationship explicit: “View cost breakdown,” selected item title, total and close/back action. Announce changes to assistive technology without surprising focus jumps.

### R14 — P2: The global “Out” control silently changes all work

**Reproduce:** Tap Out in the header. `setNetwork` rewrites every procedure's network flag, including appointments that might belong to different dentists. The header does not identify a dentist, and “Out” is ambiguous. Dentist search meanwhile uses fixed provider network flags of its own.

**Impact:** Users can mistake a cost scenario for a verified network selection, or apply one provider's status to all work. Different pages appear to disagree about what the selection means.

**Source:** `src/components/TopBar.tsx:39`, `:51`; `src/store.ts:104`, `:150`; `src/components/DentistList.tsx:48`.

**Remedy:** Bind verified network status to a dentist/visit. Put hypothetical comparisons in a labeled “Compare an out-of-network scenario” control next to the estimate. Use “Out of network” in full and announce the scope and changed total.

### R15 — P2: Similar-looking totals mean different things

**Reproduce:** The snapshot shows “you'll pay $1,752.50” on Home and Cheapest $1,752.50 on Treatment, then “After FSA tax savings: $946.75.” Enrollment shows $1,129.80 expected total including next-year premiums and care over the rest of this year plus next year. SmileStreak labels that same comparison total “Expected cost next year.”

**Impact:** A user cannot compare these numbers without discovering hidden scope and tax assumptions. “Next year” is factually the wrong time scope for the SmileStreak table's source value. Expected maybe-weighted cost is also presented as a bill-like certainty.

**Source:** `src/pages/Dashboard.tsx:37`; `src/components/ScheduleTabs.tsx:94`; `src/components/ComparisonTable.tsx:79`; `src/components/habits/NextYearCard.tsx:8`, `:18`.

**Remedy:** Standardize labels and dates: estimated payment to dentist, estimated after-tax cost, and comparison total over a stated period. Display the assumption that maybe work is probability-weighted near each headline. Derive a genuine next-year total for the rewards card or rename it to match its calculation.

### R16 — P2: The recommendation is too absolute for a tiny advantage

**Reproduce:** Enrollment confidently says Choose Acme Dental High. In the snapshot its expected advantage over Low is $18.55, on demo fees and a user-adjustable 30% probability. “Lowest expected total” provides no sense of decision sensitivity until the user finds the later tipping-point section.

**Impact:** Small modeled differences are promoted as decisive instructions. Users are not shown what could reverse the choice or how certain the input assumptions are.

**Source:** `src/components/EnrollmentCard.tsx:26`, `:74`; `src/components/ComparisonTable.tsx:10`, `:97`; `src/components/MaybeSlider.tsx:44`.

**Remedy:** Show “High is estimated to cost about $19 less under these assumptions,” the critical uncertain input, and the alternative's tradeoff. Use a close-call state when differences are small relative to available price precision. Provide a choice action or say explicitly that the app prepares a recommendation to take to enrollment.

### R17 — P2: Developer provenance is used as patient-facing reassurance

**Reproduce:** Treatment prints “FROM THE ENGINE · RULES PLAN-ACME-LOW-V3”; Ask shows question type, probability and Winnow (simulated); email urgent messages expose a classifier percentage/source; timeline delta says “recomputed in … ms”; the header dedicates a control to engine/API audit logs.

**Impact:** This is implementation theater. It demands that a patient understand the architecture to decide whether to trust a dollar figure, while the useful facts—source document, estimate limitations, next action—get less prominence.

**Evidence:** [Ask answer](mobile-ux-evidence/home-answer-375.png), [Audit](mobile-ux-evidence/audit-375.png).

**Source:** `src/pages/Treatment.tsx:60`; `src/components/AskTing.tsx:59`; `src/pages/Email.tsx:111`; `src/components/Timeline.tsx:303`; `src/components/AuditDrawer.tsx:49`.

**Remedy:** Main UI: “Based on your sample plan and estimated fees,” with a short source link. Move model names, routing categories, milliseconds and rule hashes to a clearly labeled technical detail/demo view. Retain visible demo disclosure; remove architecture jargon from ordinary member decisions.

### R18 — P2: The mobile waterfall repeats instead of explaining

**Reproduce:** Every step prints a heading/amount, a sentence repeating the same amount, and a Running total. The final step is “You pay $200” followed by “You pay $200.” On mobile the graphical waterfall is hidden; the component becomes a long ledger of repetitive prose.

**Impact:** The reader scrolls through redundancy to find the final responsibility. A transparent explanation should make the arithmetic easier to scan, not make every number appear three times.

**Source:** `src/components/Waterfall.tsx:47`, `:56`, `:70`, `:74`; `src/engine/explain.ts` templates.

**Remedy:** Lead with the member total. Show a compact equation/list: dentist fee → allowed amount → plan payment → your share. Expand exceptions (deductible, maximum exhausted, non-covered replacement, balance billing) and source evidence on demand. Keep one short explanation for a non-obvious step.

### R19 — P2: “Find a dentist” never reaches a usable dentist choice

**Reproduce:** Twelve static dentists are listed by hypothetical treatment cost, with two prices each. There is no provider selection, contact/call, address, availability filter, location input or usable next step. A closed-to-new-patients provider remains in the ranked list. The map is after the full 12-card list on mobile. Keep my dentist pins a row but does not affect treatment selection.

**Impact:** The page performs comparison without helping the person act. Hypothetical “If in network” prices for an out-of-network provider are particularly easy to mistake for options the user can choose.

**Source:** `src/components/DentistList.tsx:6`, `:50`, `:53`, `:58`; `src/pages/Dentists.tsx:18`, `:39`, `:41`; [Dentist screenshot](mobile-ux-evidence/dentists-390.png).

**Remedy:** Show the applicable estimate prominently, actual network status and availability. Hide counterfactual costs behind Compare. Provide verified directory/contact actions when available; in a demo, label them as unavailable. Use list/map tabs and a filter for accepting patients. Rename Keep my dentist to “Pin my dentist” unless it changes an actual selection.

### R20 — P2: Email has two intake addresses and no coherent routing explanation

**Reproduce:** The first card says send anything to `ting-dental@agentmail.to`; the next says forward bills to a separate `u-…@in.ting.app` address. One is disconnected in local mode, the other simulated. An empty state still says “Email Ting a document and it shows up here.”

**Impact:** Users cannot know which address to use, whether their document arrived or why nothing happened. The page's enthusiastic automation promise precedes the limitation.

**Source:** `src/pages/Email.tsx:34`, `:38`, `:97`; `src/components/ForwardingCard.tsx:52`, `:58`.

**Remedy:** Pick one primary document-intake flow and explain any second address only in setup details. In mock mode, lead with a sample-document action and “Email delivery is simulated.” Offer receipt states and a clear app upload alternative. Never instruct users to send real documents to a demo-only address.

### R21 — P2: Mobile targets are undersized and secondary copy is microscopic

**Observed:** Network choices are 28px high; Audit 32 × 32px; intake Speak/photo/submit 34px high; standard buttons about 36–38px; selected enrollment rows often 36px; remove icons roughly 28px. Essential labels use 10–12px type, and form controls in Ask, Email, Plan rules and the likelihood input use 12–14px type.

**Impact:** Fat-finger mistakes are especially damaging next to Delete and global cost switches. Long financial explanations at 11–12px impose unnecessary strain. Small form text also creates a risk of Safari zooming on focus on an actual iPhone; keyboard behavior was not tested on a physical device.

**Source:** `src/index.css:68`; `src/components/TopBar.tsx:47`, `:64`; `src/components/IntakeBox.tsx:167`, `:178`, `:291`; `src/components/ProcedureList.tsx:62`; `src/components/AskTing.tsx:45`; `src/pages/PlanRules.tsx:14`.

**Remedy:** Use at least 44px comfortable targets for primary mobile controls and adequate separation; increase text fields to 16px and ordinary explanations to a readable 14–16px. Keep technical metadata secondary rather than shrinking the whole screen to fit it.

### R22 — P2: The app knows how to make mobile cards, then leaves other critical tables clipped

**Reproduce:** Compare options correctly converts to cards on phones. Plan rules and handoff retain 420px minimum tables; SmileStreak next-year costs also use 420px; the privacy table uses 460px. At 390px, the far-right “Never sees” privacy column and net-cost column need sideways scrolling with little signposting.

**Impact:** The least visible columns contain the exact information users need for privacy and financial decisions. Pinning labels with a scroller does not repair the reading order.

**Source:** `src/components/ComparisonTable.tsx:20`; `src/pages/PlanRules.tsx:241`; `src/components/HandoffSheet.tsx:49`; `src/components/habits/NextYearCard.tsx:14`; `src/components/habits/PrivacyControls.tsx:30`.

**Remedy:** Reuse the mobile card pattern for each plan/provider/audience/visit. Privacy should read “Your insurer sees … / never sees …” in one visible group. Keep tables only where side-by-side comparison is necessary and provide an obvious scrolling cue with a sticky first column.

### R23 — P2: Modal accessibility is asserted but not implemented

**Reproduce:** Open Audit. Focus initially enters Close, but after two Tabs the active element is the background Skip to content link. The drawer claims `aria-modal="true"`, yet no focus trap or background inertness exists. Closing does not restore focus to the opener. The sign-in consent dialog also lacks initial focus/focus containment in source.

**Impact:** Keyboard and assistive-technology users can navigate invisible background content while the app claims they are in a modal. This is especially confusing with a full-screen phone drawer.

**Source:** `src/components/AuditDrawer.tsx:21`, `:43`; `src/auth/ConsentDialog.tsx:19`.

**Remedy:** Use an accessible dialog primitive with initial focus, focus containment, inert background, Escape where appropriate and focus restoration. Verify using Tab/Shift+Tab and a mobile screen reader, not just modal attributes.

### R24 — P2: Touch glossary interactions are brittle

**Source behavior:** Glossary opens on focus, then click toggles the same state. A touch can focus and toggle in one interaction. Tooltip positioning is fixed to `left-1/2`, 240px wide, without viewport collision detection. Dismissal relies on blur/mouse leave; the definition is not reachable as a stable dialog.

**Impact:** A term near the edge can show a clipped definition, and phone users do not have hover or desktop title tooltips. “Inferred,” “Proved” and sample explanations also rely on titles that do not provide an easy mobile path. The SmileStreak calendar is a grid of colored squares with no visible day/date labels; session dates exist only in titles and accessibility labels, so a sighted touch user cannot inspect a missed day.

**Source:** `src/components/GlossaryTerm.tsx:20`, `:23`, `:34`; `src/components/VerifiedBadge.tsx:43`; `src/components/IntakeBox.tsx:263`; `src/components/habits/StreakCalendar.tsx:19`, `:24`.

**Remedy:** Open a stable popover/bottom sheet on click/tap with collision handling and an explicit close action. Avoid independent focus-plus-click toggles. Provide readable definitions beside relevant exceptions; no essential disclosure should exist only in `title`. Give the streak grid visible date context and tap-to-inspect day details.

### R25 — P2: A member's “Approve” looks like authoritative verification

**Reproduce/source behavior:** After a benefits upload, a member can Approve these rules, get an “Approved as …” version and fingerprint, then Use as my current plan. Send for plan review is a separate optional action.

**Impact:** The app conflates a user's confirmation of extracted text with insurer/analyst approval. Hashes and the word Approved create stronger assurance than the action actually warrants.

**Source:** `src/pages/PlanRules.tsx:66`, `:198`, `:201`, `:209`; `src/compiler/compile.ts` approval helper.

**Remedy:** Distinguish “You confirmed these extracted rules” from “Reviewed by plan administrator.” Keep the latter unavailable until actual review. Show unresolved questions and estimates based on unreviewed rules in plain language. Link the extracted source text before confirmation.

### R26 — P2: Share and calendar labels overpromise completion

**Reproduce:** Share with my dentist creates a link but does not send it to the dentist. Add to calendar downloads an `.ics` file but does not confirm import. The share link is a truncated technical URL with Copy; clipboard failures are not handled. Forwarding Copy has no visible confirmation at all. Calendar events use specific dental procedure titles and costs without a preview.

**Impact:** A user can believe their dentist received the plan or a calendar reminder exists when neither has happened. On a phone, a downloaded file is an extra setup step. Sensitive calendar content is not obvious before import.

**Source:** `src/components/DentistQuestions.tsx:44`, `:57`, `:64`; `src/components/ForwardingCard.tsx:62`; `src/components/EnrollmentCard.tsx:54`, `:99`; `src/lib/ics.ts:63`.

**Remedy:** Label the operation “Create dentist share link” and provide a preview, Copy confirmation and native share-sheet action where supported. Label calendar export as export/import, show what events and detail will be included, and explain the next step. Handle failed clipboard writes and provide a manual fallback.

### R27 — P2: Small X buttons permanently remove work and alter scheduling relationships

**Reproduce/source behavior:** Tap the small X next to an item. The item disappears immediately, and `removeProcedure` also removes references to that item from remaining dependencies. There is no undo, summary of the change or way to edit existing procedure details from the row.

**Impact:** An accidental tap can change both the treatment plan and its permissible order. Reload restoration is not a usable undo strategy. The app makes removal easier than correction.

**Source:** `src/components/ProcedureList.tsx:60`, `:65`; `src/store.ts:258`.

**Remedy:** Add a timely Undo toast and explicit edit action for name/code/tooth/fee/deadline. Explain dependent-visit consequences before committing a removal that changes sequencing; preserve an edit history suitable for restoring the whole appointment.

### R28 — P2: Onboarding converts uncertainty into a new cleaning instead of clarifying

**Reproduce/source behavior:** Any answer except “Less than 6 months ago,” including “Not sure,” adds a new D1110 cleaning. The demo already has one planned. The entered date/category is not stored as service history. Finishing calls addProcedures; if scheduling returns an error, the page stays on the last question without showing it. Parse mutation errors also lack a displayed error.

**Impact:** “Not sure” becomes an action the user never requested; duplicate planned cleanings are possible. The supposedly quick introduction creates work and can leave the user stuck.

**Source:** `src/components/OnboardingStepper.tsx:21`, `:26`, `:29`.

**Remedy:** Use the answer to establish uncertain cleaning history, check existing visits/limits and ask before adding a suggested cleaning. Make “Not sure” stay uncertain. Render failures next to the final action with a retry and route to treatment review before applying parsed items.

### R29 — P2: Demo disclosure is fragmented instead of describing the active experience

**Reproduce:** Home says Hi Dale and shows live-looking balances, personal claims and brushing rewards. Individual pages use Sample plan, Demo fees, Demo dentists & fees, Demo mail, Simulated mail and Demo program terms. The strongest statement that the app is a hackathon prototype appears in a footer thousands of pixels down. Share says Demo handoff even for a successfully fetched snapshot.

**Impact:** The app simultaneously looks personalized and disclaims assorted components. Users cannot tell whether the profile, fees, insurer connection, email delivery, device status and handoff are real or sample. Inconsistent terminology makes “demo” background noise.

**Source:** `src/components/DemoDataPill.tsx:1`; `src/components/SamplePlanNote.tsx:1`; `src/components/EstimateFooter.tsx:1`; `src/pages/Dashboard.tsx:34`; `src/pages/Share.tsx:53`; `src/habits/store.ts:77`.

**Remedy:** Add one persistent, readable “Sample member experience” status with a details panel stating what is simulated and what is connected. Use per-feature status only for meaningful deviations. Base share labeling on the actual source. Never show a demo device as simply connected beside real connection buttons.

### R30 — P2: Expiring benefits are framed as money the user should consume

**Reproduce:** Home reminder copy says “You still have $190 of annual max … book now” and “After Dec 31 it's gone.” It groups annual max, covered cleanings and FSA forfeiture into one loss narrative, even though the displayed FSA balance can carry some money over and has scheduled use.

**Impact:** A coverage ceiling is presented like owned cash to spend. It can distract from the only relevant question: what needed care, within the dentist's timing window, could use remaining coverage? Blanket forfeiture language conflicts with the app's own carryover display.

**Source:** `src/components/RemindersCard.tsx:36`; `src/engine/reminders.ts:56`, `:59`, `:67`; `src/components/FsaCountdown.tsx`; [Home screenshot](mobile-ux-evidence/home-390.png).

**Remedy:** Separate “Coverage available for planned care” from “FSA dollars at risk.” Name the specific needed procedure or due cleaning and timing constraints, and compute the genuinely expiring FSA portion. If nothing needed is actionable, say so instead of creating a use-it-up imperative.

## Remediation sequence

1. **Make actions truthful:** unify enrollment recommendation/export/share; remove invalid-share fallback; preserve state and deletion; fix privacy initialization; expose errors.
2. **Remove unsupported personalization:** discard the unused family question, invented crown history and adherence-driven clinical probability. Keep unknown facts unknown until the user or source provides them.
3. **Rebuild the phone task flow:** visible member navigation; next-action overview; tap-edit visit list; inline/bottom-sheet cost breakdown; clear actual dentist/network scope.
4. **Make the language consistent:** one cost/time vocabulary; one demo status system; user-confirmed versus insurer-reviewed rules; create-link/export labels; concise arithmetic with expandable exceptions.
5. **Verify on physical phones:** iPhone keyboard/camera/file import, Android upload/clipboard, native share sheet, touch scrolling versus dragging, 200% text and VoiceOver/TalkBack. Do this after the behavioral fixes, so device testing does not merely certify broken promises.

## Evidence index

Screenshots intentionally preserve the reviewed state; they are evidence, not updated product mockups. Raw DOM measurement summaries and reproducible journey observations are saved in [viewport measurements](mobile-ux-evidence/viewport-measurements.json) and [functional observations](mobile-ux-evidence/functional-observations.json).

- [Home 390px](mobile-ux-evidence/home-390.png)
- [Treatment 390px](mobile-ux-evidence/treatment-390.png)
- [Treatment 375px](mobile-ux-evidence/treatment-375.png)
- [Treatment 320px](mobile-ux-evidence/treatment-320.png)
- [Treatment WebKit 390px](mobile-ux-evidence/treatment-webkit-390.png)
- [Enrollment 390px](mobile-ux-evidence/enroll-390.png)
- [Dentists 390px](mobile-ux-evidence/dentists-390.png)
- [Email 390px](mobile-ux-evidence/email-390.png)
- [SmileStreak 390px](mobile-ux-evidence/habits-390.png)
- [Plan rules 390px](mobile-ux-evidence/plan-390.png)
- [Onboarding 390px](mobile-ux-evidence/onboarding-390.png)
- [Ask answer 375px](mobile-ux-evidence/home-answer-375.png)
- [Audit drawer 375px](mobile-ux-evidence/audit-375.png)
- [Invalid share 375px](mobile-ux-evidence/invalid-share-375.png)
