import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PlanPreferences } from "../engine/types";
import { useAppStore, useProfile } from "../store";
import { IntakeBox } from "./IntakeBox";

const CLEANING = [
  { value: "recent", label: "Less than 6 months ago" },
  { value: "sixToTwelveMonths", label: "6–12 months ago" },
  { value: "overAYear", label: "Over a year ago" },
  { value: "unknown", label: "Not sure" },
];
const COVERED = [
  { value: "self", label: "Just me" },
  { value: "partner", label: "Me + spouse/partner" },
  { value: "children", label: "Me + kids" },
  { value: "family", label: "My whole family" },
];
const MOVING = [
  { value: "yes", label: "Yes, I move cities frequently" },
  { value: "no", label: "No, I usually stay in one city" },
  { value: "unknown", label: "Not sure yet" },
];

export function OnboardingStepper() {
  const saved = useProfile().preferences;
  const [step, setStep] = useState(saved?.surveyCompleted ? 4 : 0);
  const [work, setWork] = useState(saved?.plannedWork ?? "");
  const [cleaning, setCleaning] = useState(saved?.lastCleaning ?? "");
  const [covered, setCovered] = useState(saved?.covered ?? "");
  const [moving, setMoving] = useState(
    saved?.surveyCompleted
      ? saved.movesFrequently === undefined
        ? "unknown"
        : saved.movesFrequently
          ? "yes"
          : "no"
      : "",
  );
  const save = useAppStore((s) => s.setPlanPreferences);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const questions = [
    {
      title: "Is any dental work planned?",
      why: "Bring your dentist’s recommendations so you can review the work and its cost. You can leave this blank.",
      valid: true,
    },
    {
      title: "When was your last cleaning?",
      why: "We’ll help you check the cleaning benefits in your plan. This answer does not add a visit or claim.",
      valid: !!cleaning,
    },
    {
      title: "Who’s covered by your plan?",
      why: "Ting prices one person’s care at a time. Family deductibles and premiums need separate confirmation.",
      valid: !!covered,
    },
    {
      title: "Do you move cities frequently?",
      why: "Care outside a plan’s network can matter when you change cities. We can prioritize that coverage when comparing plans.",
      valid: !!moving,
    },
  ];
  const saveAnswers = () => {
    save({
      plannedWork: work.trim(),
      lastCleaning: cleaning as PlanPreferences["lastCleaning"],
      covered: covered as PlanPreferences["covered"],
      movesFrequently: moving === "unknown" ? undefined : moving === "yes",
      surveyCompleted: true,
    });
    setStep(4);
  };
  if (step === 4)
    return (
      <section className="mx-auto max-w-2xl border-t border-line pt-5">
        <h2 ref={heading} tabIndex={-1}>
          Your survey answers
        </h2>
        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-sm text-muted">Planned work</dt>
            <dd>{work.trim() || "No work entered"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Last cleaning</dt>
            <dd>{CLEANING.find((x) => x.value === cleaning)?.label}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">People covered</dt>
            <dd>{COVERED.find((x) => x.value === covered)?.label}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Moving cities</dt>
            <dd>{MOVING.find((x) => x.value === moving)?.label}</dd>
          </div>
        </dl>
        {moving === "yes" && (
          <p className="mt-5 border-l-2 border-brand-600 pl-4">
            Your plan recommendation will prioritize documented out-of-network
            benefits. Confirm dentists and allowances in any city you expect to
            live in.
          </p>
        )}
        {covered !== "self" && (
          <p className="mt-4 text-muted">
            These estimates still cover one person. Family costs are not
            included.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/enroll" className="btn-primary">
            See plan recommendations
          </Link>
          <button className="btn-secondary" onClick={() => setStep(0)}>
            Edit survey answers
          </button>
        </div>
        <div className="mt-8 border-t border-line pt-5">
          <h3 className="text-lg font-medium">Review your planned work</h3>
          <p className="mt-3 mb-5 text-muted">
            Check the procedures and any missing details before adding them.
            Your survey has not added treatment automatically.
          </p>
          <IntakeBox initialText={work} />
          <Link to="/treatment" className="btn-secondary mt-5">
            Review treatment and dates
          </Link>
        </div>
      </section>
    );
  const question = questions[step];
  return (
    <section className="mx-auto max-w-2xl border-t border-line pt-5">
      <ol aria-label="Survey progress" className="mb-5 flex gap-2">
        {questions.map((q, i) => (
          <li
            key={q.title}
            className={`h-1.5 flex-1 ${i <= step ? "bg-brand-600" : "bg-line"}`}
          >
            <span className="sr-only">
              Question {i + 1}
              {i === step ? ", current" : i < step ? ", completed" : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">Question {step + 1} of 4</p>
      <h2 ref={heading} tabIndex={-1} className="mt-2">
        {question.title}
      </h2>
      <p className="mt-3 mb-5 text-muted">{question.why}</p>
      {step === 0 && (
        <label className="block">
          Planned dental work
          <textarea
            rows={3}
            className="mt-2 w-full rounded-lg border border-line p-3"
            placeholder="e.g. My dentist said I need a crown on #19"
            value={work}
            onChange={(e) => setWork(e.target.value)}
          />
        </label>
      )}
      {step === 1 && (
        <Choices
          options={CLEANING}
          value={cleaning}
          onChange={(v) =>
            setCleaning(v as NonNullable<PlanPreferences["lastCleaning"]>)
          }
          name="Last cleaning"
        />
      )}
      {step === 2 && (
        <Choices
          options={COVERED}
          value={covered}
          onChange={(v) =>
            setCovered(v as NonNullable<PlanPreferences["covered"]>)
          }
          name="People covered"
        />
      )}
      {step === 3 && (
        <Choices
          options={MOVING}
          value={moving}
          onChange={setMoving}
          name="Moving frequency"
        />
      )}
      <div className="mt-6 flex justify-between gap-3">
        <button
          className="btn-secondary"
          disabled={step === 0}
          onClick={() => setStep((n) => n - 1)}
        >
          Back
        </button>
        <button
          className="btn-primary"
          disabled={!question.valid}
          onClick={() => (step === 3 ? saveAnswers() : setStep((n) => n + 1))}
        >
          {step === 3 ? "Save survey answers" : "Next"}
        </button>
      </div>
    </section>
  );
}
function Choices({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">{name}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-4 ${value === o.value ? "border-brand-600 bg-brand-50" : "border-line"}`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="accent-brand-600"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
