import { Link } from 'react-router-dom';
import { leftOnTable } from '../engine/helpers';
import { useReminderSchedule } from '../hooks/useReminderSchedule';
import { formatDate, formatMoney, formatPercent, procedureName } from '../lib/format';
import { downloadIcs, type IcsEvent } from '../lib/ics';
import { useActive, useComparison, useProfile } from '../store';
import { ShareWithDentist } from './DentistQuestions';
import { BellIcon, CalendarIcon, ChevronIcon } from './Icons';

interface Action {
  headline: string;
  reason: string;
  date?: string;
}

export function EnrollmentCard({ variant = 'full' }: { variant?: 'compact' | 'full' }) {
  const { card } = useComparison();
  const profile = useProfile();
  const active = useActive();
  const reminders = useReminderSchedule();
  const { choice, fsa } = card;

  const actions: Action[] = [
    {
      headline: `Choose ${choice.plan.name}`,
      reason: `Lowest expected cost for this year and ${fsa.year}: ${formatMoney(choice.total)} in premiums and care after tax${
        choice.switching ? ', including the switch from your current plan' : ''
      }.`,
    },
    ...(fsa.election > 0
      ? [
          {
            headline: `Elect ${formatMoney(fsa.election)} FSA for ${fsa.year}`,
            reason: `Covers the ${formatMoney(fsa.expectedCare)} you're expected to pay in ${fsa.year}${
              fsa.carryoverIn > 0 ? `, less ${formatMoney(fsa.carryoverIn)} carried in` : ''
            }, with pre-tax money. IRS limit ${formatMoney(fsa.limit)}${fsa.provisional ? ' (not yet published)' : ''}.`,
          },
        ]
      : []),
    ...card.items.map((i) => ({
      headline: `${i.label} ${i.likelihood < 1 ? `if needed (${formatPercent(i.likelihood)} likely)` : i.when}`,
      reason: `${i.prepDated ? 'Book the preparation appointment by then: the plan year follows the prep date. ' : ''}Paid from your ${i.fsaYear} FSA.`,
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
        title: `Dentist: ${p ? procedureName(p) : 'dental visit'}`,
        date: pl.date,
        description: `Estimated cost to you: ${formatMoney(owes.get(pl.id) ?? 0)}.`,
      };
    });
    const left = leftOnTable(profile, active);
    if (profile.money.fsaOffered && profile.money.fsaBalance > 0)
      events.push({
        uid: 'fsa-deadline',
        title: 'FSA deadline: use remaining dental FSA money',
        date: left.fsaDeadline,
        description: left.fsaExpiring > 0 ? `${formatMoney(left.fsaExpiring)} at risk of being forfeited.` : undefined,
      });
    downloadIcs('ting-dental-plan.ics', events);
  };

  return (
    <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 sm:p-5" aria-labelledby="enroll-card-title">
      <div className="eyebrow mb-1 text-brand-700">Your enrollment card</div>
      <h2 id="enroll-card-title" className="text-lg leading-snug font-semibold sm:text-xl">
        {fsa.election > 0
          ? `Choose ${choice.plan.name} and put ${formatMoney(fsa.election)} in your ${fsa.year} FSA`
          : `Choose ${choice.plan.name}`}
      </h2>

      <ul className="mt-3 divide-y divide-brand-100 rounded-xl border border-brand-100 bg-white">
        {actions.map((a) => (
          <li key={a.headline}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <span className="flex-1 font-medium">{a.headline}</span>
                {a.date && <span className="tabular text-xs text-muted">{formatDate(a.date, { year: true })}</span>}
                <ChevronIcon className="text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-3 pb-2.5 text-sm text-muted">{a.reason}</p>
            </details>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Expected savings {formatMoney(card.expectedSavings)} vs keeping your plan and doing everything now. {card.disclaimer}
      </p>

      {variant === 'full' ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <button type="button" className="btn-secondary" onClick={exportIcs}>
            <CalendarIcon /> Add to calendar
          </button>
          <ShareWithDentist compact />
          <button
            type="button"
            className="btn-secondary"
            aria-pressed={reminders.on}
            disabled={reminders.toggle.isPending}
            onClick={() => reminders.toggle.mutate()}
          >
            <BellIcon /> {reminders.toggle.isPending ? 'Saving…' : reminders.on ? 'Reminders on' : 'Remind me'}
          </button>
          {reminders.on && (
            <p className="w-full text-xs text-muted" role="status">
              {reminders.reminders.length
                ? `We'll remind you on ${reminders.reminders.map((r) => formatDate(r.sendOn)).join(', ')} before this year's benefits expire. `
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
    </section>
  );
}
