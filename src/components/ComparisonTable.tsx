import { round2 } from '../engine/adjudicate';
import type { OptionResult } from '../engine/compare';
import { formatMoney } from '../lib/format';
import { useComparison, useProfile } from '../store';
import { CheckIcon } from './Icons';

export function ComparisonTable() {
  const { options, best, insights } = useComparison();
  const { currentPlan } = useProfile();
  const why = (o: OptionResult) =>
    o === best
      ? 'Lowest expected total.'
      : `${formatMoney(round2(o.total - best.total))} more than ${best.plan.name} in an expected year${
          o.badYearTotal < best.badYearTotal ? `, but ${formatMoney(round2(best.badYearTotal - o.badYearTotal))} less if every "maybe" happens` : ''
        }.`;
  const current = (o: OptionResult) => o.plan.id === currentPlan.id;

  return (
    <>
      {/* Phones: one card per plan */}
      <ul className="space-y-3 md:hidden">
        {options.map((o) => (
          <li key={o.plan.id} className={`rounded-xl border p-3 ${o === best ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {o.plan.name}
                {current(o) && <span className="ml-1.5 text-xs font-normal text-muted">(current)</span>}
              </span>
              {o === best && <RecommendedTag />}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Premiums after tax</dt>
              <dd className="tabular text-right">{formatMoney(o.premiumCost)}</dd>
              <dt className="text-muted">Expected care</dt>
              <dd className="tabular text-right">{formatMoney(o.careCost)}</dd>
              <dt className="font-medium">Expected total</dt>
              <dd className="tabular text-right font-semibold">{formatMoney(o.total)}</dd>
              <dt className="text-muted">If every maybe happens</dt>
              <dd className="tabular text-right">{formatMoney(o.badYearTotal)}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">{why(o)}</p>
          </li>
        ))}
      </ul>

      {/* Tablets and up: a table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Plan comparison for next plan year</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Option</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Premiums after tax</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Expected care</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Expected total</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">If every maybe happens</th>
              <th scope="col" className="py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.plan.id} className={`border-b border-line align-top ${o === best ? 'bg-brand-50' : ''}`}>
                <th scope="row" className="py-3 pr-3 text-left font-semibold">
                  {o.plan.name}
                  {current(o) && <span className="block text-xs font-normal text-muted">current</span>}
                  {o === best && <RecommendedTag />}
                </th>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(o.premiumCost)}</td>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(o.careCost)}</td>
                <td className="tabular py-3 pr-3 text-right text-base font-semibold">{formatMoney(o.total)}</td>
                <td className="tabular py-3 pr-3 text-right">{formatMoney(o.badYearTotal)}</td>
                <td className="py-3 text-xs text-muted">{why(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Care covers the rest of this year (on your current plan) and next year, each option scheduled its cheapest way, after FSA tax savings.
      </p>
      {insights.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {insights.map((i) => (
            <li key={i.text} className={`rounded-lg px-3 py-2 ${i.id === 'maybe' ? 'bg-brand-50 text-brand-900' : 'bg-paper'}`}>
              {i.text}
            </li>
          ))}
        </ul>
      )}
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
