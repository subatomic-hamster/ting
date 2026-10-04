import { DENTISTS, useDentistQuotes } from "../hooks/useDentistQuotes";
import { formatMoney } from "../lib/format";
export function DentistList({ pinnedId }: { pinnedId?: string }) {
  const quotes = useDentistQuotes();
  const sorted = [...DENTISTS].sort((a, b) =>
    a.id === pinnedId
      ? -1
      : b.id === pinnedId
        ? 1
        : quotes.get(a.id)!.yourCost - quotes.get(b.id)!.yourCost,
  );
  return (
    <ol className="divide-y divide-line">
      {sorted.map((d) => {
        const q = quotes.get(d.id)!;
        return (
          <li key={d.id} className="py-5">
            <h3>
              {d.name}
              {d.id === pinnedId ? " (current dentist)" : ""}
            </h3>
            <p className="mt-2 text-xs text-muted">
              {d.neighborhood} · {d.distanceMiles} miles ·{" "}
              {d.inNetwork ? "In-network scenario" : "Out-of-network scenario"}
            </p>
            <div className="mt-3 flex flex-wrap justify-between gap-3">
              <span>Estimated amount you pay</span>
              <span className="tabular text-xl font-medium">
                {formatMoney(q.yourCost)}
              </span>
            </div>
            {!d.acceptingNew && (
              <p className="mt-2 text-xs text-muted">
                Not accepting new patients in this sample.
              </p>
            )}
            <details className="mt-3">
              <summary className="text-brand-700">
                Compare network scenarios
              </summary>
              <dl className="space-y-3">
                <div className="flex justify-between gap-3">
                  <dt>If in-network</dt>
                  <dd className="tabular">{formatMoney(q.inNetworkCost)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>If out-of-network</dt>
                  <dd className="tabular">{formatMoney(q.outOfNetworkCost)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                The out-of-network estimate includes{" "}
                {formatMoney(q.outOfNetworkExtra)} in extra charges above
                allowances. Confirm both fees and allowances before booking.
              </p>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
