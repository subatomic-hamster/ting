import { Link } from "react-router-dom";
import { leftOnTable } from "../engine/helpers";
import { useReminderSchedule } from "../hooks/useReminderSchedule";
import {
  formatDate,
  formatMoney,
  formatPercent,
  procedureName,
} from "../lib/format";
import { downloadIcs, type IcsEvent } from "../lib/ics";
import { useComparison, useProfile } from "../store";
import { ShareWithDentist } from "./DentistQuestions";
import { BellIcon, CalendarIcon, ChevronIcon } from "./Icons";

interface Action {
  headline: string;
  reason: string;
  date?: string;
}

export function EnrollmentCard({
  variant = "full",
}: {
  variant?: "compact" | "full";
}) {
  const { card, options } = useComparison();
  const incomplete = options.some((o) =>
    o.schedule.lines.some((l) => l.pricingWarning),
  );
  const profile = useProfile();
  const { choice, fsa } = card;
  const active = { ...choice.schedule, kind: "cheapest" as const };
  const reminders = useReminderSchedule(active);

  const actions: Action[] = [
    {
      headline: `${incomplete ? "Compare" : "Choose"} ${choice.plan.name}`,
      reason: `Lowest expected cost for this year and ${fsa.year}: ${formatMoney(choice.total)} in premiums and care after tax${
        choice.switching ? ", including the switch from your current plan" : ""
      }.`,
    },
    ...(fsa.election > 0
      ? [
          {
            headline: `Elect ${formatMoney(fsa.election)} FSA for ${fsa.year}`,
            reason: `Covers the ${formatMoney(fsa.expectedCare)} you're expected to pay in ${fsa.year}${
              fsa.carryoverIn > 0
                ? `, less ${formatMoney(fsa.carryoverIn)} carried in`
                : ""
            }, with pre-tax money. IRS limit ${formatMoney(fsa.limit)}${fsa.provisional ? " (not yet published)" : ""}.`,
          },
        ]
      : []),
    ...card.items.map((i) => ({
      headline: `${i.label} ${i.likelihood < 1 ? `if needed (${formatPercent(i.likelihood)} likely)` : i.when}`,
      reason: `${i.prepDated ? "Book the preparation appointment by then: the plan year follows the prep date. " : ""}Paid from your ${i.fsaYear} FSA.`,
      date: i.date,
    })),
  ];

  const exportIcs = () => {
    const byId = new Map(profile.procedures.map((p) => [p.id, p]));
    const owes = new Map(active.lines.map((l) => [l.id, l.memberOwes]));
    const events: IcsEvent[] = active.placements.map((pl) => {
      const p = byId.get(pl.id);
      return {
        uid: `visit-${pl.id}`,
        title: `Dentist: ${p ? procedureName(p) : "dental visit"}`,
        date: pl.date,
        description: `Estimated cost to you: ${formatMoney(owes.get(pl.id) ?? 0)}.`,
      };
    });
    const left = leftOnTable(profile, active);
    if (profile.money.fsaOffered && profile.money.fsaBalance > 0)
      events.push({
        uid: "fsa-deadline",
        title: "FSA deadline: use remaining dental FSA money",
        date: left.fsaDeadline,
        description:
          left.fsaExpiring > 0
            ? `${formatMoney(left.fsaExpiring)} at risk of being forfeited.`
            : undefined,
      });
    downloadIcs("ting-dental-plan.ics", events);
  };

  return (
    <section
      className="border-l-2 border-brand-600 bg-white pl-5"
      aria-labelledby="enroll-card-title"
    >
      <p className="mb-2 text-base">
        {incomplete ? "Lowest modeled cost for" : "Recommended plan for"}{" "}
        {fsa.year}
      </p>
      <h2
        id="enroll-card-title"
        className="text-lg leading-snug font-semibold sm:text-xl"
      >
        {fsa.election > 0
          ? `${incomplete ? "Review" : "Choose"} ${choice.plan.name} and ${formatMoney(fsa.election)} for your ${fsa.year} FSA`
          : `${incomplete ? "Compare" : "Choose"} ${choice.plan.name}`}
      </h2>

      <p className="tabular mt-4 text-[32px] leading-[38px] font-medium">
        {formatMoney(choice.total)}
      </p>
      <p className="mt-2 text-xs text-muted">
        Expected total with premiums and care after tax, across this year and{" "}
        {fsa.year}.
      </p>
      {incomplete && (
        <p className="mt-3 border-l-2 border-warn pl-3">
          Some options lack confirmed insurer allowances or replacement
          eligibility. Those items budget the full fee. Confirm them before
          choosing or waiving coverage, or making an FSA election.
        </p>
      )}
      {variant === "full" ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <button type="button" className="btn-primary" onClick={exportIcs}>
            <CalendarIcon /> Download calendar file
          </button>
          <ShareWithDentist
            compact
            schedule={active}
            rulesVersion={choice.plan.version}
          />
          <button
            type="button"
            className="btn-secondary"
            aria-pressed={reminders.on}
            disabled={reminders.toggle.isPending}
            onClick={() => reminders.toggle.mutate()}
          >
            <BellIcon />{" "}
            {reminders.toggle.isPending
              ? "Saving…"
              : reminders.on
                ? "Reminders on"
                : "Remind me"}
          </button>
          {reminders.toggle.isError && (
            <p role="alert">Could not update reminders. Please try again.</p>
          )}
          {reminders.on && (
            <p className="w-full text-xs text-muted" role="status">
              {reminders.reminders.length
                ? `We'll remind you on ${reminders.reminders.map((r) => formatDate(r.sendOn)).join(", ")} before this year's benefits expire. `
                : "Nothing is set to expire unused this year, so there's nothing to remind you about yet. "}
              <Link to="/" className="underline">
                See them on your dashboard
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <Link to="/enroll" className="btn-primary mt-3">
          Compare plans
        </Link>
      )}
      <details className="mt-5 border-t border-line">
        <summary className="text-brand-700">Plan and date details</summary>
        <ul className="mt-3 divide-y divide-brand-100 rounded-xl border border-brand-100 bg-white">
          {actions.map((a) => (
            <li key={a.headline}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 font-medium">{a.headline}</span>
                  {a.date && (
                    <span className="tabular text-xs text-muted">
                      {formatDate(a.date, { year: true })}
                    </span>
                  )}
                  <ChevronIcon className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-3 pb-2.5 text-sm text-muted">{a.reason}</p>
              </details>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-2 text-xs text-muted">
        Expected savings {formatMoney(card.expectedSavings)} vs keeping your
        plan and doing everything now.
      </p>
    </section>
  );
}
