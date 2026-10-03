import { withCredit } from '../../habits/rewards';
import { formatMoney } from '../../lib/format';
import { useResult } from '../../store';

export function NextYearCard({ credit }: { credit: number }) {
  const result = useResult();
  const rows = withCredit(result.comparison, credit);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1.5 font-medium">Plan</th>
            <th className="py-1.5 text-right font-medium">Expected cost next year</th>
            <th className="py-1.5 text-right font-medium">SmileStreak credit</th>
            <th className="py-1.5 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.planId}>
              <td className="py-2 font-medium">
                {r.name}
                {r.recommended && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">recommended</span>}
              </td>
              <td className="tabular py-2 text-right">{formatMoney(r.expectedTotal)}</td>
              <td className="tabular py-2 text-right text-save">−{formatMoney(r.credit)}</td>
              <td className="tabular py-2 text-right font-semibold">{formatMoney(r.netTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        The credit is the same on every plan, so it lowers your cost without changing which plan is best for you.
      </p>
    </div>
  );
}
