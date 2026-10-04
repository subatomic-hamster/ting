// The sign-up survey: six one-tap questions that set up the member's plan and dental year, then an optional
// set of lifestyle questions that earns the wellness discount. Every question can be answered "not sure".
import { useEffect, useRef, useState } from 'react';
import { MEMBER_PLANS, type MemberPlanId } from '../data/members';
import { WELLNESS_TERMS } from '../engine/risk';
import type { Lifestyle, PlanPreferences } from '../engine/types';
import { formatMoney } from '../lib/format';

type Goal = NonNullable<PlanPreferences['goals']>[number];

const CLEANING = [
  { value: 'recent', label: 'Less than 6 months ago' },
  { value: 'sixToTwelveMonths', label: '6–12 months ago' },
  { value: 'overAYear', label: 'Over a year ago' },
  { value: 'unknown', label: 'Not sure' },
];
const COVERED = [
  { value: 'self', label: 'Just me' },
  { value: 'partner', label: 'Me + spouse/partner' },
  { value: 'children', label: 'Me + kids' },
  { value: 'family', label: 'My whole family' },
];
const LAST_YEAR = [
  { value: 'underused', label: 'Hardly any of it', hint: 'Cleanings and checkups only' },
  { value: 'some', label: 'Some of it', hint: 'A filling or two' },
  { value: 'hitMax', label: 'All of it', hint: 'I ran out of my annual max' },
  { value: 'unknown', label: 'Not sure' },
];
const GOALS: { value: Goal; label: string }[] = [
  { value: 'wisdomTeeth', label: 'Wisdom teeth out' },
  { value: 'braces', label: 'Braces (me or a child)' },
  { value: 'implant', label: 'An implant' },
  { value: 'crown', label: 'A crown' },
];
const MOVING = [
  { value: 'yes', label: 'Yes, I move cities often' },
  { value: 'no', label: 'No, I usually stay put' },
  { value: 'unknown', label: 'Not sure yet' },
];

const LIFESTYLE: { key: keyof Lifestyle; title: string; options: { value: string; label: string }[] }[] = [
  { key: 'brushing', title: 'How often do you brush?', options: [{ value: 'once', label: 'Once a day' }, { value: 'twice', label: 'Twice a day' }, { value: 'more', label: 'More than twice' }] },
  { key: 'flossing', title: 'How often do you floss?', options: [{ value: 'daily', label: 'Daily' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'rarely', label: 'Rarely' }] },
  { key: 'sugaryDrinks', title: 'Sugary drinks or snacks between meals?', options: [{ value: 'rarely', label: 'Rarely' }, { value: 'daily', label: 'Most days' }, { value: 'several', label: 'Several times a day' }] },
  { key: 'tobacco', title: 'Do you use tobacco or vape?', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
  { key: 'grinding', title: 'Do you grind or clench your teeth?', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'unsure', label: 'Not sure' }] },
  { key: 'bleedingGums', title: 'Do your gums bleed when you brush?', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
  { key: 'dryMouth', title: 'Does your mouth often feel dry?', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
];

export interface SurveyResult {
  planId: MemberPlanId;
  survey: PlanPreferences;
}

const yesNo = (v: string | undefined) => (v === undefined ? undefined : v === 'yes');

export function SurveyWizard({ initial, onSubmit, busy, error }: { initial?: SurveyResult; onSubmit: (r: SurveyResult) => void; busy?: boolean; error?: string }) {
  const s0 = initial?.survey;
  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState<string>(initial?.planId ?? '');
  const [cleaning, setCleaning] = useState<string>(s0?.lastCleaning ?? '');
  const [covered, setCovered] = useState<string>(s0?.covered ?? '');
  const [lastYear, setLastYear] = useState<string>(s0?.lastYear ?? '');
  const [goals, setGoals] = useState<Goal[]>((s0?.goals ?? []).filter((g) => g !== 'none'));
  const [work, setWork] = useState(s0?.plannedWork ?? '');
  const [moving, setMoving] = useState(s0?.surveyCompleted ? (s0.movesFrequently === undefined ? 'unknown' : s0.movesFrequently ? 'yes' : 'no') : '');
  const l0 = s0?.lifestyle;
  const [lifestyle, setLifestyle] = useState<Record<string, string>>(
    l0
      ? { ...l0, tobacco: l0.tobacco ? 'yes' : 'no', bleedingGums: l0.bleedingGums ? 'yes' : 'no', dryMouth: l0.dryMouth ? 'yes' : 'no' }
      : {},
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus();
  }, [step]);

  const base = (): PlanPreferences => ({
    plannedWork: work.trim() || undefined,
    lastCleaning: cleaning as PlanPreferences['lastCleaning'],
    covered: covered as PlanPreferences['covered'],
    lastYear: lastYear as PlanPreferences['lastYear'],
    goals: goals.length ? goals : ['none'],
    movesFrequently: moving === 'unknown' ? undefined : moving === 'yes',
    surveyCompleted: true,
  });
  const finish = (withLifestyle: boolean) =>
    onSubmit({
      planId: planId as MemberPlanId,
      survey: {
        ...base(),
        lifestyle: withLifestyle
          ? {
              brushing: lifestyle.brushing as Lifestyle['brushing'],
              flossing: lifestyle.flossing as Lifestyle['flossing'],
              sugaryDrinks: lifestyle.sugaryDrinks as Lifestyle['sugaryDrinks'],
              tobacco: yesNo(lifestyle.tobacco) ?? false,
              grinding: lifestyle.grinding as Lifestyle['grinding'],
              bleedingGums: yesNo(lifestyle.bleedingGums) ?? false,
              dryMouth: yesNo(lifestyle.dryMouth) ?? false,
            }
          : undefined,
      },
    });

  const steps = [
    {
      title: 'Which dental plan are you enrolled in?',
      why: 'Your employer, Acme Manufacturing, offers these three. Pick the one on your benefits card.',
      valid: !!planId,
      body: (
        <Choices
          name="Plan"
          value={planId}
          onChange={setPlanId}
          options={MEMBER_PLANS.map((p) => ({
            value: p.id,
            label: p.name,
            hint: `${formatMoney(p.premiumMonthly)}/month · ${formatMoney(p.annualMax)} yearly max · ${p.orthoLifetimeMax ? 'covers braces' : 'no braces'}`,
          }))}
        />
      ),
    },
    {
      title: 'When was your last cleaning?',
      why: 'Cleanings are covered twice a year. This sets when your next one is due.',
      valid: !!cleaning,
      body: <Choices name="Last cleaning" value={cleaning} onChange={setCleaning} options={CLEANING} />,
    },
    {
      title: 'Who’s on your dental plan?',
      why: 'Ting prices one person’s care at a time; family costs need a separate check.',
      valid: !!covered,
      body: <Choices name="People covered" value={covered} onChange={setCovered} options={COVERED} />,
    },
    {
      title: 'Last year, how much of your plan’s yearly max did you use?',
      why: 'If you ran out, a plan with a bigger max may pay for itself. If you barely used it, a cheaper plan may do.',
      valid: !!lastYear,
      body: <Choices name="Last year" value={lastYear} onChange={setLastYear} options={LAST_YEAR} />,
    },
    {
      title: 'Any dental goals for the next two years?',
      why: 'Big work changes which plan is cheapest, especially braces and implants. Pick any, or none.',
      valid: true,
      body: (
        <div className="grid gap-3">
          <fieldset className="grid gap-3">
            <legend className="sr-only">Dental goals</legend>
            {GOALS.map((g) => (
              <label key={g.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-4 ${goals.includes(g.value) ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={goals.includes(g.value)}
                  onChange={(e) => setGoals(e.target.checked ? [...goals, g.value] : goals.filter((x) => x !== g.value))}
                />
                {g.label}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="font-medium">Has a dentist recommended any work? (optional)</span>
            <textarea
              rows={3}
              maxLength={1000}
              className="mt-2 w-full rounded-lg border border-line p-3"
              placeholder="e.g. My dentist said I need a crown on #19"
              value={work}
              onChange={(e) => setWork(e.target.value)}
            />
          </label>
        </div>
      ),
    },
    {
      title: 'Do you move cities often?',
      why: 'Out-of-network coverage matters more if your dentist may change with your city.',
      valid: !!moving,
      body: <Choices name="Moving" value={moving} onChange={setMoving} options={MOVING} />,
    },
  ];
  const count = steps.length;
  const lifestyleComplete = LIFESTYLE.every((q) => lifestyle[q.key]);

  if (step === count)
    return (
      <section>
        <h2 ref={heading} tabIndex={-1}>
          Save {Math.round(WELLNESS_TERMS.pct * 100)}% on your premium
        </h2>
        <p className="mt-3">
          Answer {LIFESTYLE.length} quick lifestyle questions and Acme Dental takes {Math.round(WELLNESS_TERMS.pct * 100)}% off your premium for {WELLNESS_TERMS.months} months
          (sample program terms). Your answers also sharpen what Ting expects your dental year to cost.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>About one minute. Every answer is used only for your own recommendations.</li>
          <li>Health answers are protected health information: never shared with your employer, never used to price your coverage.</li>
          <li>You can change or delete them anytime.</li>
        </ul>
        {error && (
          <p role="alert" className="mt-4 border-l-2 border-cost pl-3">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-3 sm:flex">
          <button className="btn-primary" onClick={() => setStep(count + 1)}>
            Answer and save {Math.round(WELLNESS_TERMS.pct * 100)}%
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => finish(false)}>
            {busy ? 'Saving…' : 'Skip for now'}
          </button>
        </div>
        <button className="btn-ghost mt-3" onClick={() => setStep(count - 1)}>
          Back
        </button>
      </section>
    );

  if (step === count + 1)
    return (
      <section>
        <h2 ref={heading} tabIndex={-1}>
          Lifestyle questions
        </h2>
        <p className="mt-2 text-muted">Optional. Completing all {LIFESTYLE.length} earns the discount.</p>
        <div className="mt-5 grid gap-6">
          {LIFESTYLE.map((q) => (
            <fieldset key={q.key}>
              <legend className="font-medium">{q.title}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <label
                    key={o.value}
                    className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-4 ${lifestyle[q.key] === o.value ? 'border-brand-600 bg-brand-50' : 'border-line'}`}
                  >
                    <input
                      type="radio"
                      name={q.key}
                      className="accent-brand-600"
                      checked={lifestyle[q.key] === o.value}
                      onChange={() => setLifestyle({ ...lifestyle, [q.key]: o.value })}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 border-l-2 border-cost pl-3">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-3 sm:flex">
          <button className="btn-primary" disabled={!lifestyleComplete || busy} onClick={() => finish(true)}>
            {busy ? 'Saving…' : 'Finish and apply discount'}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => finish(false)}>
            Skip these questions
          </button>
        </div>
      </section>
    );

  const q = steps[step];
  return (
    <section>
      <ol aria-label="Survey progress" className="mb-5 flex gap-2">
        {steps.map((x, i) => (
          <li key={x.title} className={`h-1.5 flex-1 ${i <= step ? 'bg-brand-600' : 'bg-line'}`}>
            <span className="sr-only">
              Question {i + 1}
              {i === step ? ', current' : i < step ? ', completed' : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        Question {step + 1} of {count}
      </p>
      <h2 ref={heading} tabIndex={-1} className="mt-2">
        {q.title}
      </h2>
      <p className="mt-3 mb-5 text-muted">{q.why}</p>
      {q.body}
      <div className="mt-6 flex justify-between gap-3">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        <button className="btn-primary" disabled={!q.valid} onClick={() => setStep(step + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}

function Choices({ options, value, onChange, name }: { options: { value: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void; name: string }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">{name}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-4 ${value === o.value ? 'border-brand-600 bg-brand-50' : 'border-line'}`}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-brand-600" />
          <span>
            {o.label}
            {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
