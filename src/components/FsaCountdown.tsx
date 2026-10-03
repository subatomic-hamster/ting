import { leftOnTable } from '../engine/helpers';
import { diffDays } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { useActive, useProfile } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

const RULES = {
  none: 'Use it or lose it',
  carryover: 'Some can carry over',
  grace: 'Grace period',
} as const;

export function FsaCountdown() {
  const profile = useProfile();
  const { fsaExpiring, fsaDeadline } = leftOnTable(profile, useActive());
  const { money } = profile;
  if (!money.fsaOffered) return <p className="text-sm text-muted">No FSA through your employer.</p>;
  const days = Math.max(0, diffDays(fsaDeadline, profile.asOf));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>
          <GlossaryTerm term="fsa" /> balance
        </span>
        <span className="text-xs text-muted">{RULES[money.fsaRule.kind]}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold">{formatMoney(money.fsaBalance)}</span>
        <span className="text-sm text-muted">
          <span className="tabular font-semibold text-ink">{days}</span> days left (until {formatDate(fsaDeadline, { year: true })})
        </span>
      </div>
      {fsaExpiring > 0 ? (
        <p className="mt-1 text-sm font-medium text-cost">{formatMoney(fsaExpiring)} at risk of being forfeited</p>
      ) : (
        <p className="mt-1 text-sm text-save">Your scheduled work uses it in time.</p>
      )}
    </div>
  );
}
