import { Link } from "react-router-dom";
import {
  dentalProfile,
  habitEffect,
  WELLNESS_TERMS,
  type PredictedItem,
} from "../engine/risk";
import { formatDate, formatPercent } from "../lib/format";
import { useProfile } from "../store";
import { Section } from "./Section";
import { useMemberRecord } from "./useMemberRecord";

const ROUTINE = new Set(["D1110", "D0120", "D0274"]);
const TIER = { low: "Low", moderate: "Moderate", high: "High" } as const;

/**
 * F3: what the onboarding survey (and any shared brushing data) says about the coming year.
 * Built from the member's record, or from the profile's preferences for a sample member that has them.
 */
export function DentalProfileCard() {
  const record = useMemberRecord();
  const profile = useProfile();
  const survey = record?.survey ?? profile.preferences;
  if (!survey) return null;

  const risk = dentalProfile(survey, record?.habits);
  const effect = habitEffect(survey, record?.habits);
  const items = risk.predicted.filter((i) => !ROUTINE.has(i.cdt));
  const drivers = [...new Set(items.flatMap((i) => i.because))];
  const discount = profile.money.premiumDiscount;
  const pct = Math.round(WELLNESS_TERMS.pct * 100);

  return (
    <Section title="Your dental profile" id="dental-profile">
      <p className="-mt-3 mb-4 text-xs text-muted">
        Educational estimate from your answers for budgeting. Not a diagnosis;
        only your dentist can say what you need.
      </p>
      <p className="text-base">
        Your year looks{" "}
        <strong data-testid="profile-year">{risk.year}</strong>.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 text-sm">
        <div>
          <dt className="text-muted">Cavity risk</dt>
          <dd className="font-semibold" data-testid="profile-caries">
            {TIER[risk.caries]}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Gum risk</dt>
          <dd className="font-semibold" data-testid="profile-gums">
            {TIER[risk.gums]}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Cleaning every</dt>
          <dd className="font-semibold">{risk.recallMonths} months</dd>
        </div>
      </dl>

      <h3 className="mt-5 text-base font-semibold">Care we expect</h3>
      <p className="mt-1 text-sm text-muted">
        Every year: cleanings, checkup exams and bitewing X-rays.
      </p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {items.map((i) => (
            <PredictedRow key={i.cdt} item={i} />
          ))}
        </ul>
      )}
      {drivers.length > 0 ? (
        <p className="mt-3 text-xs text-muted">
          Answers behind this: {drivers.join("; ")}.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">
          {survey.lifestyle
            ? "Your answers show no extra risk, so only routine care is expected."
            : "Without the optional lifestyle questions, only routine care is expected."}
        </p>
      )}

      {record?.habits && (effect || risk.habitNote) && (
        <div className="mt-4 border-l-2 border-brand-600 pl-3 text-sm" data-testid="profile-habit">
          <p className="font-medium">From your brush</p>
          <p className="text-muted">{risk.habitNote}</p>
          {effect && <p className="mt-1">{effect.text}</p>}
        </div>
      )}

      <div className="mt-4 text-sm" data-testid="profile-wellness">
        {discount ? (
          <p>
            <strong>
              {Math.round(discount.pct * 100)}% off your premium until{" "}
              {formatDate(discount.until, { year: true })}
            </strong>{" "}
            for completing the wellness questions. Sample terms.
          </p>
        ) : record && !record.survey.lifestyle ? (
          <Link to="/onboarding" className="btn-secondary w-full sm:w-auto">
            Answer 7 questions to save {pct}%
          </Link>
        ) : null}
      </div>
      {record && (
        <Link to="/onboarding" className="btn-ghost mt-2 -ml-4">
          Edit my answers
        </Link>
      )}
    </Section>
  );
}

function PredictedRow({ item }: { item: PredictedItem }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{item.label.replace(/ \(maybe\)$/, "")}</span>
        <span className="tabular text-muted">
          {item.likelihood < 1
            ? `${formatPercent(item.likelihood)} likely`
            : "a goal you chose"}
        </span>
      </div>
      {item.likelihood < 1 && (
        <p className="text-xs text-muted">because: {item.because.join(", ")}</p>
      )}
    </li>
  );
}
