import { formatMoney } from '../lib/format';
import { percentOf } from '../lib/geometry';
import { useProfile } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

export function DeductibleBar() {
  const { ledger, currentPlan } = useProfile();
  const met = ledger.deductibleMet;
  const total = currentPlan.deductible.amount;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <GlossaryTerm term="deductible" />
        <span className="tabular text-muted">
          <span className="font-semibold text-ink">{formatMoney(met)}</span> of {formatMoney(total)} met
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Deductible: ${formatMoney(met)} of ${formatMoney(total)} met`}>
        <div className="h-full rounded-full bg-plan transition-[width] duration-500" style={{ width: `${percentOf(met, total)}%` }} />
      </div>
    </div>
  );
}
