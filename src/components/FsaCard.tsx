import { formatDate, formatMoney } from '../lib/format';
import { useAppStore, useResult } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

export function FsaCard() {
  const { fsa } = useResult();
  const rule = useAppStore((s) => s.fsa.rule);
  return (
    <div>
      <p className="text-sm text-muted">
        Recommended <GlossaryTerm term="fsa" /> election for next year
      </p>
      <p className="tabular text-3xl font-semibold">{formatMoney(fsa.recommendedElection)}</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">IRS limit (sample)</dt>
          <dd className="tabular">{formatMoney(fsa.irsLimit)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Carryover limit (sample)</dt>
          <dd className="tabular">{rule === 'carryover' ? formatMoney(fsa.carryoverLimit) : 'Not offered'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">This year's money expires</dt>
          <dd>{formatDate(fsa.forfeitDate, { year: true })}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">At risk this year</dt>
          <dd className={`tabular font-medium ${fsa.atRisk > 0 ? 'text-cost' : 'text-save'}`}>{formatMoney(fsa.atRisk)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">Sized to your expected out-of-pocket on the recommended plan, so little is left to forfeit.</p>
    </div>
  );
}
