import { formatMoney } from '../lib/format';
import { percentOf } from '../lib/geometry';
import { useResult } from '../store';
import { GlossaryTerm } from './GlossaryTerm';

export function DeductibleBar() {
  const { deductible } = useResult();
  const pct = percentOf(deductible.met, deductible.total);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <GlossaryTerm term="deductible" />
        <span className="tabular text-muted">
          <span className="font-semibold text-ink">{formatMoney(deductible.met)}</span> of {formatMoney(deductible.total)} met
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`Deductible: ${formatMoney(deductible.met)} of ${formatMoney(deductible.total)} met`}
      >
        <div className="h-full rounded-full bg-plan transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
