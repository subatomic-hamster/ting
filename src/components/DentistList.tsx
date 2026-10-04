import { DENTISTS, useDentistQuotes } from '../hooks/useDentistQuotes';
import { formatMoney } from '../lib/format';

export function DentistList({ pinnedId }: { pinnedId?: string }) {
  const quotes = useDentistQuotes();
  const sorted = [...DENTISTS].sort((a, b) => {
    if (a.id === pinnedId) return -1;
    if (b.id === pinnedId) return 1;
    const qa = quotes.get(a.id)!.yourCost;
    const qb = quotes.get(b.id)!.yourCost;
    return qa === qb ? 0 : qa < qb ? -1 : 1;
  });

  // The column matching the dentist's network status is what you'd pay; the other is the comparison.
  const cell = (applies: boolean) =>
    `tabular rounded-lg px-2 py-1 text-right ${applies ? 'bg-brand-50 font-semibold text-ink ring-1 ring-brand-200' : 'text-sm text-muted'}`;

  return (
    <div>
      <p className="mb-2 text-xs text-muted">Highlighted: what you'd pay at that dentist.</p>
      <div className="mb-2 hidden grid-cols-[1fr_8rem_9rem] gap-3 px-3 text-xs font-medium text-muted md:grid">
        <span>Dentist</span>
        <span className="text-right">If in network</span>
        <span className="text-right">If out of network</span>
      </div>
      <ol className="space-y-2">
        {sorted.map((d) => {
          const q = quotes.get(d.id)!;
          const pinned = d.id === pinnedId;
          const vsCheapest = q.vsCheapest > 0 && (
            <span className="tabular block text-[11px] font-normal text-muted">{formatMoney(q.vsCheapest, { signed: true })} vs cheapest</span>
          );
          return (
            <li
              key={d.id}
              className={`grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border p-3 md:grid-cols-[1fr_8rem_9rem] md:items-center ${
                pinned ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'
              }`}
            >
              <div className="col-span-2 min-w-0 md:col-span-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{d.name}</span>
                  {pinned && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Your dentist</span>}
                </div>
                <div className="text-xs text-muted">
                  {d.neighborhood} · {d.distanceMiles} mi ·{' '}
                  <span className={d.inNetwork ? 'font-medium text-save' : 'font-medium text-warn'}>
                    {d.inNetwork ? 'In network' : 'Out of network'}
                  </span>
                  {!d.acceptingNew && ' · not accepting new patients'}
                </div>
              </div>
              <div className={cell(d.inNetwork)}>
                <span className="block text-[11px] font-normal text-muted md:hidden">If in network</span>
                {formatMoney(q.inNetworkCost)}
                {d.inNetwork && vsCheapest}
              </div>
              <div className={cell(!d.inNetwork)}>
                <span className="block text-[11px] font-normal text-muted md:hidden">If out of network</span>
                {formatMoney(q.outOfNetworkCost)}
                <span className="block text-[11px] font-normal text-muted">incl. {formatMoney(q.outOfNetworkExtra)} balance bill</span>
                {!d.inNetwork && vsCheapest}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
