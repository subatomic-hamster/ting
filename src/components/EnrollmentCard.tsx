import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney } from '../lib/format';
import { downloadIcs, type IcsEvent } from '../lib/ics';
import { useAppStore, useResult } from '../store';
import { ShareWithDentist } from './DentistQuestions';
import { BellIcon, CalendarIcon, ChevronIcon } from './Icons';

/** Engine action labels read "Headline — reason". */
function split(label: string): { headline: string; reason?: string } {
  const i = label.indexOf(' — ');
  return i < 0 ? { headline: label } : { headline: label.slice(0, i), reason: label.slice(i + 3) };
}

export function EnrollmentCard({ variant = 'full' }: { variant?: 'compact' | 'full' }) {
  const result = useResult();
  const procedures = useAppStore((s) => s.procedures);
  const fsa = useAppStore((s) => s.fsa);
  const [reminded, setReminded] = useState(false);
  const card = result.enrollmentCard;
  const actions = card.actions.map((a) => ({ ...a, ...split(a.label) }));
  const sentence = [...actions.map((a) => a.headline), `expected savings ${formatMoney(card.expectedSavings)}`].join(' · ');

  const exportIcs = () => {
    const byId = new Map(procedures.map((p) => [p.id, p]));
    const events: IcsEvent[] = result.activeSchedule.items.map((i) => {
      const p = byId.get(i.procedureId);
      const name = p ? `${p.label}${p.tooth ? ` #${p.tooth}` : ''}` : 'Dental visit';
      return {
        uid: `visit-${i.procedureId}`,
        title: `Dentist: ${name}`,
        date: i.date,
        description: `Estimated cost to you: ${formatMoney(i.memberPays)}. ${i.dentistQuestion ?? ''}`.trim(),
      };
    });
    events.push({
      uid: 'fsa-deadline',
      title: 'FSA deadline — use remaining dental FSA money',
      date: fsa.forfeitDate,
      description: result.fsa.atRisk > 0 ? `${formatMoney(result.fsa.atRisk)} at risk of being forfeited.` : undefined,
    });
    downloadIcs('ting-dental-plan.ics', events);
  };

  return (
    <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 sm:p-5" aria-labelledby="enroll-card-title">
      <div className="eyebrow mb-1 text-brand-700">Your enrollment card</div>
      <h2 id="enroll-card-title" className="text-lg leading-snug font-semibold sm:text-xl">
        {sentence}
      </h2>

      <ul className="mt-3 divide-y divide-brand-100 rounded-xl border border-brand-100 bg-white">
        {actions.map((a) => (
          <li key={a.label}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <span className="flex-1 font-medium">{a.headline}</span>
                {a.date && <span className="tabular text-xs text-muted">{formatDate(a.date, { year: true })}</span>}
                <ChevronIcon className="text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-3 pb-2.5 text-sm text-muted">{a.reason ?? 'Part of your recommended plan.'}</p>
            </details>
          </li>
        ))}
      </ul>

      {variant === 'full' ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <button type="button" className="btn-secondary" onClick={exportIcs}>
            <CalendarIcon /> Add to calendar
          </button>
          <ShareWithDentist compact />
          <button type="button" className="btn-secondary" aria-pressed={reminded} onClick={() => setReminded((r) => !r)}>
            <BellIcon /> {reminded ? 'Reminder set' : 'Remind me'}
          </button>
          {reminded && (
            <p className="w-full text-xs text-muted" role="status">
              We'll remind you a week before each date (demo: no messages are sent).
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
