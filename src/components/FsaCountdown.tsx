import { diffDays } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore, useResult } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

const RULES = {
  none: 'Use it or lose it',
  carryover: 'Some can carry over',
  grace: 'Grace period',
} as const;

export function FsaCountdown() {
  const fsa = useAppStore((s) => s.fsa);
  const asOf = useAppStore((s) => s.asOf);
  const result = useResult();
  const days = Math.max(0, diffDays(fsa.forfeitDate, asOf));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>
          <GlossaryTerm term="fsa" /> balance
        </span>
        <span className="text-xs text-muted">{RULES[fsa.rule]}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold">{formatMoney(fsa.balance)}</span>
        <span className="text-sm text-muted">
          <span className="tabular font-semibold text-ink">{days}</span> days left (until {formatDate(fsa.forfeitDate, { year: true })})
        </span>
      </div>
      {result.fsa.atRisk > 0 ? (
        <p className="mt-1 text-sm font-medium text-cost">{formatMoney(result.fsa.atRisk)} at risk of being forfeited</p>
      ) : (
        <p className="mt-1 text-sm text-save">Your scheduled work uses it in time.</p>
      )}
    </div>
  );
}
