import { formatDate, formatMoney } from '../lib/format';
import { useComparison, useProfile } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

export function FsaCard() {
  const { card } = useComparison();
  const { money } = useProfile();
  const { fsa } = card;
  if (!money.fsaOffered) return <p className="text-sm text-muted">Your employer doesn't offer an FSA.</p>;
  return (
    <div>
      <p className="text-sm text-muted">
        Recommended <GlossaryTerm term="fsa" /> election for {fsa.year}
      </p>
      <p className="tabular text-3xl font-semibold">{formatMoney(fsa.election)}</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Expected out-of-pocket care in {fsa.year}</dt>
          <dd className="tabular">{formatMoney(fsa.expectedCare)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Already covered by money carried in</dt>
          <dd className="tabular">{formatMoney(fsa.carryoverIn)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">IRS limit{fsa.provisional ? ' (not yet published)' : ''}</dt>
          <dd className="tabular">{formatMoney(fsa.limit)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">This year's balance left after care</dt>
          <dd className="tabular">{formatMoney(fsa.leftoverThisYear)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">This year's money must be spent by</dt>
          <dd>{formatDate(fsa.forfeitDate, { year: true })}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Sized to your expected out-of-pocket on the recommended plan and schedule, rounded up to $10, so little is left to forfeit.
      </p>
    </div>
  );
}
