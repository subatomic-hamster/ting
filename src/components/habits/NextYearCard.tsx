import { withCredit } from "../../habits/rewards";
import { formatMoney } from "../../lib/format";
import { useComparison } from "../../store";

export function NextYearCard({ credit }: { credit: number }) {
  const { options, best } = useComparison();
  const rows = withCredit(
    options.map((o) => ({
      planId: o.plan.id,
      name: o.plan.name,
      expectedTotal: o.total,
      recommended: o.plan.id === best.plan.id,
    })),
    credit,
  );

  return (
    <div>
      <p className="mb-3 text-base text-muted">
        Expected premiums and care after tax for this year and next year.
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.planId} className="py-4">
            <h3>{r.name}</h3>
            <dl className="mt-3 space-y-3">
              <div className="flex justify-between gap-3">
                <dt>Expected total</dt>
                <dd className="tabular">{formatMoney(r.expectedTotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Brushing credit</dt>
                <dd className="tabular">−{formatMoney(r.credit)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Total after credit</dt>
                <dd className="tabular font-medium">
                  {formatMoney(r.netTotal)}
                </dd>
              </div>
            </dl>
            {r.recommended && (
              <p className="mt-2 text-xs text-muted">Lowest expected cost</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        The credit is the same on every plan, so it lowers your cost without
        changing which plan is best for you.
      </p>
    </div>
  );
}
