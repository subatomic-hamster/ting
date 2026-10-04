import { Link } from "react-router-dom";
import { yearEndReview } from "../engine/overview";
import { formatMoney, formatPercent } from "../lib/format";
import { useActive, useComparison, useProfile } from "../store";
import { Section } from "./Section";

const STATUS = {
  over: "Over your maximum",
  under: "Under your maximum",
  "on track": "On track",
} as const;

/** F4: how this plan year is going, what next year holds, and the plan that fits it. Every number is the engine's. */
export function YearEndReview({ link = false }: { link?: boolean }) {
  const profile = useProfile();
  const active = useActive();
  const cmp = useComparison();
  const r = yearEndReview(profile, active, cmp);
  const rec = r.recommendation;
  const last = r.lastYear;

  return (
    <Section title={`Year-end review: ${r.year}`} id="year-end">
      <p className="-mt-3 mb-4 text-xs text-muted">
        Educational estimate, not insurance or tax advice. Sample plans and demo fees.
      </p>

      <h3 className="text-base font-semibold">
        This year:{" "}
        <span data-testid="year-end-status">{STATUS[r.status]}</span>
      </h3>
      <p className="mt-1 text-sm">
        {formatMoney(r.used)} used + {formatMoney(r.scheduled)} scheduled of{" "}
        your {formatMoney(r.annualMax)} annual maximum. {r.message}
      </p>
      {last && (
        <p className="mt-2 text-sm text-muted">
          Last year ({last.year}):{" "}
          {last.signal === "ran out"
            ? `you ran out of your maximum (${formatMoney(last.planPaid)} paid).`
            : last.signal === "barely used"
              ? `you barely used your plan (${formatMoney(last.planPaid)} of ${formatMoney(last.annualMax)}).`
              : `the plan paid ${formatMoney(last.planPaid)} of ${formatMoney(last.annualMax)}.`}
        </p>
      )}

      <h3 className="mt-5 text-base font-semibold">
        Planned and expected for {r.nextYear}
      </h3>
      {r.nextYearItems.length ? (
        <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
          {r.nextYearItems.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 py-2"
            >
              <span>
                {i.label}
                {i.likelihood < 1 && (
                  <span className="text-muted">
                    {" "}
                    · {formatPercent(i.likelihood)} likely
                  </span>
                )}
              </span>
              <span className="tabular text-muted">
                you pay {formatMoney(i.memberOwes)}
                {i.likelihood < 1 ? " if needed" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Nothing is planned for {r.nextYear} yet.
        </p>
      )}

      <h3 className="mt-5 text-base font-semibold">
        Suggested plan for {r.nextYear}
      </h3>
      <p className="mt-1 text-base" data-testid="year-end-plan">
        <strong>{rec.stay ? `Stay on ${rec.plan}` : rec.plan}</strong>:{" "}
        <span className="tabular">{formatMoney(rec.total)}</span> expected in
        premiums and care after tax
        {rec.stay
          ? "."
          : `, versus ${formatMoney(rec.currentTotal)} on your current plan${rec.saves > 0 ? ` (${formatMoney(rec.saves)} less)` : ""}.`}{" "}
        If every "maybe" happens: {formatMoney(rec.badYearTotal)}.
      </p>
      {rec.discount > 0 && (
        <p className="mt-1 text-sm text-save">
          Includes your wellness discount ({formatMoney(rec.discount)} off
          premiums).
        </p>
      )}
      {rec.reasons.slice(0, 2).map((t) => (
        <p key={t} className="mt-2 text-sm">
          {t}
        </p>
      ))}
      {rec.waitingCaveats.map((t) => (
        <p key={t} className="mt-2 border-l-2 border-warn pl-3 text-sm">
          {t}
        </p>
      ))}
      {link && (
        <Link to="/enroll" className="btn-primary mt-4 w-full sm:w-auto">
          Compare all plans
        </Link>
      )}
    </Section>
  );
}
