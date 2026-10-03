import { useState } from 'react';
import { useHabitStore } from '../../habits/store';
import { formatDate } from '../../lib/format';

const ROWS: { who: string; sees: string; never: string }[] = [
  { who: 'You', sees: 'Every session, your streak, your credits.', never: '—' },
  {
    who: 'Your dentist',
    sees: 'A 30-day summary on the visit handoff page, only if you turn it on below.',
    never: 'Individual sessions or times.',
  },
  {
    who: 'Lincoln',
    sees: 'Your credit total (to pay it) and, if you allow, counts in groups of 20 or more.',
    never: 'Sessions, times or device IDs. Never used for pricing, underwriting or claim decisions.',
  },
  { who: 'Your employer', sees: 'The credit amount to deposit to your FSA/HSA.', never: 'Any brushing data.' },
];

export function PrivacyControls() {
  const consent = useHabitStore((s) => s.consent);
  const count = useHabitStore((s) => s.sessions.length);
  const setShare = useHabitStore((s) => s.setShare);
  const optOut = useHabitStore((s) => s.optOut);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1.5 font-medium">Who</th>
              <th className="py-1.5 font-medium">Sees</th>
              <th className="py-1.5 font-medium">Never sees</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {ROWS.map((r) => (
              <tr key={r.who}>
                <td className="py-2 pr-3 font-medium">{r.who}</td>
                <td className="py-2 pr-3">{r.sees}</td>
                <td className="py-2 text-muted">{r.never}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {consent.optedIn && (
        <>
          <div className="space-y-2">
            <Toggle
              label="Share a 30-day summary with my dentist"
              checked={consent.shareWithDentist}
              onChange={(v) => setShare('shareWithDentist', v)}
            />
            <Toggle
              label="Include me in Lincoln's group counts (20+ people)"
              checked={consent.shareAggregateWithLincoln}
              onChange={(v) => setShare('shareAggregateWithLincoln', v)}
            />
          </div>
          <div className="rounded-xl border border-line p-3 text-sm">
            <p>
              Collecting since {consent.consentedAt ? formatDate(consent.consentedAt, { year: true }) : 'today'} · {count} sessions stored.
            </p>
            {confirming ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-cost">Delete all {count} sessions and leave SmileStreak?</span>
                <button type="button" className="btn bg-cost text-white hover:opacity-90" onClick={() => { optOut(); setConfirming(false); }}>
                  Delete everything
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn-ghost mt-2 text-cost" onClick={() => setConfirming(true)}>
                Leave and delete my data
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}
