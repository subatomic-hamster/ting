import type { PlanComparisonRow } from '../contracts';
import { formatMoney, formatPercent } from '../lib/format';
import { useAppStore, useResult } from '../store';
import { CheckIcon } from './Icons';

function useTipping() {
  const procedures = useAppStore((s) => s.procedures);
  return (row: PlanComparisonRow) => {
    if (!row.tippingPoint) return undefined;
    const p = procedures.find((x) => x.id === row.tippingPoint!.procedureId);
    return `Above a ${formatPercent(row.tippingPoint.likelihood)} chance of ${p ? p.label.toLowerCase() : 'that work'}, ${row.name} pays for itself.`;
  };
}

export function ComparisonTable() {
  const { comparison } = useResult();
  const selectedPlanId = useAppStore((s) => s.selectedPlanId);
  const tipping = useTipping();

  return (
    <>
      {/* Phones: one card per plan */}
      <ul className="space-y-3 md:hidden">
        {comparison.map((r) => (
          <li key={r.planId} className={`rounded-xl border p-3 ${r.recommended ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {r.name}
                {r.planId === selectedPlanId && <span className="ml-1.5 text-xs font-normal text-muted">(current)</span>}
              </span>
              {r.recommended && <RecommendedTag />}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Premium / yr</dt>
              <dd className="tabular text-right">{formatMoney(r.annualPremium)}</dd>
              <dt className="text-muted">Expected out of pocket</dt>
              <dd className="tabular text-right">{formatMoney(r.expectedOutOfPocket)}</dd>
              <dt className="font-medium">Expected total</dt>
              <dd className="tabular text-right font-semibold">{formatMoney(r.expectedTotal)}</dd>
              <dt className="text-muted">Bad year out of pocket</dt>
              <dd className="tabular text-right">{formatMoney(r.badYearOutOfPocket)}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">{r.reason}</p>
            {tipping(r) && <p className="mt-1 text-xs font-medium text-violet-800">{tipping(r)}</p>}
          </li>
        ))}
      </ul>

      {/* Tablets and up: a table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Plan comparison for next plan year</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Plan</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Premium / yr</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Expected out of pocket</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Expected total</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Bad year out of pocket</th>
              <th scope="col" className="py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((r) => (
              <tr key={r.planId} className={`border-b border-line align-top ${r.recommended ? 'bg-brand-50' : ''}`}>
                <th scope="row" className="py-3 pr-3 text-left font-semibold">
                  {r.name}
                  {r.planId === selectedPlanId && <span className="block text-xs font-normal text-muted">current</span>}
                  {r.recommended && <RecommendedTag />}
                </th>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(r.annualPremium)}</td>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(r.expectedOutOfPocket)}</td>
                <td className="tabular py-3 pr-3 text-right text-base font-semibold">{formatMoney(r.expectedTotal)}</td>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(r.badYearOutOfPocket)}</td>
                <td className="py-3 text-xs text-muted">
                  {r.reason}
                  {tipping(r) && <span className="mt-1 block font-medium text-violet-800">{tipping(r)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">"Bad year" assumes every maybe happens plus one unexpected crown.</p>
    </>
  );
}

function RecommendedTag() {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
      <CheckIcon width={12} height={12} /> Recommended
    </span>
  );
}
