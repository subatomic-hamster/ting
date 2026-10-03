import { formatMoney } from '../lib/format';
import { GlossaryTerm } from './GlossaryTerm';
import { DENTISTS, useDentistQuotes } from '../hooks/useDentistQuotes';

export function NetworkCompare({ dentistId }: { dentistId: string }) {
  const quotes = useDentistQuotes();
  const d = DENTISTS.find((x) => x.id === dentistId);
  const q = quotes.get(dentistId);
  if (!d || !q) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line p-3">
        <div className="text-xs text-muted">{d.name} as an in-network dentist</div>
        <div className="tabular text-2xl font-semibold">{formatMoney(q.inNetworkCost)}</div>
      </div>
      <div className="rounded-xl border border-line p-3">
        <div className="text-xs text-muted">Same fees, out of network</div>
        <div className="tabular text-2xl font-semibold">{formatMoney(q.outOfNetworkCost)}</div>
        <div className="tabular text-xs text-cost">
          {formatMoney(q.outOfNetworkExtra, { signed: true })} mostly <GlossaryTerm term="balance billing" />
        </div>
      </div>
    </div>
  );
}
