import { formatDate, formatMoney } from '../lib/format';
import { useComparison, useProfile } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

export function FsaCard() {
  const { card } = useComparison();
  const { money } = useProfile();
  const { fsa } = card;
  if (!money.fsaOffered) return <p className="text-sm text-muted">Your employer doesn't offer an FSA.</p>;
  const thisYear = fsa.year - 1;
  // Only differences between engine amounts; the election itself is the engine's.
  const forfeited = Math.max(0, fsa.leftoverThisYear - fsa.carryoverIn);
  const capped = fsa.election >= fsa.limit;
  return (
    <div>
      <p className="text-sm text-muted">
        Put this in your <GlossaryTerm term="fsa" /> for {fsa.year}
      </p>
      <p className="tabular text-3xl font-semibold">{formatMoney(fsa.election)}</p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Care you're expected to pay in {fsa.year}</dt>
          <dd className="tabular">{formatMoney(fsa.expectedCare)}</dd>
        </div>
        {fsa.carryoverIn > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Minus money carried in from {thisYear}</dt>
            <dd className="tabular">{formatMoney(-fsa.carryoverIn)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-line pt-1 font-medium">
          <dt>{capped ? 'Capped at the IRS limit' : 'Rounded up to the nearest $10'}</dt>
          <dd className="tabular">{formatMoney(fsa.election)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm">
        {fsa.leftoverThisYear > 0
          ? forfeited > 0
            ? `You'll have ${formatMoney(fsa.leftoverThisYear)} left in your ${thisYear} FSA after planned care. Spend ${formatMoney(forfeited)} of it by ${formatDate(fsa.forfeitDate, { year: true })} or lose it.`
            : `The ${formatMoney(fsa.leftoverThisYear)} left in your ${thisYear} FSA after planned care carries into ${fsa.year}.`
          : `Your planned care uses all of your ${thisYear} FSA by ${formatDate(fsa.forfeitDate, { year: true })}.`}
      </p>
      <p className="mt-2 text-xs text-muted">
        IRS limit for {fsa.year}: {formatMoney(fsa.limit)}
        {fsa.provisional ? ` (the ${fsa.year} limit isn't published yet, so this uses last year's)` : ''}. Sized to your expected out-of-pocket on the
        recommended plan and schedule, so little is left to forfeit.
      </p>
    </div>
  );
}
