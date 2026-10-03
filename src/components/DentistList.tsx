import { DENTISTS, useDentistQuotes } from '../hooks/useDentistQuotes';
import { formatMoney } from '../lib/format';
import { DemoDataPill } from './DemoDataPill';

export function DentistList({ pinnedId }: { pinnedId?: string }) {
  const quotes = useDentistQuotes();
  const sorted = [...DENTISTS].sort((a, b) => {
    if (a.id === pinnedId) return -1;
    if (b.id === pinnedId) return 1;
    const qa = quotes.get(a.id)!.yourCost;
    const qb = quotes.get(b.id)!.yourCost;
    return qa === qb ? 0 : qa < qb ? -1 : 1;
  });

  return (
    <div>
      <div className="mb-2 hidden grid-cols-[1fr_7rem_7rem_9rem] gap-3 px-3 text-xs font-medium text-muted md:grid">
        <span>Dentist</span>
        <span className="text-right">Your cost</span>
        <span className="text-right">If in network</span>
        <span className="text-right">If out of network</span>
      </div>
      <ol className="space-y-2">
        {sorted.map((d) => {
          const q = quotes.get(d.id)!;
          const pinned = d.id === pinnedId;
          return (
            <li
              key={d.id}
              className={`grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border p-3 md:grid-cols-[1fr_7rem_7rem_9rem] md:items-center ${
                pinned ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'
              }`}
            >
              <div className="col-span-2 min-w-0 md:col-span-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{d.name}</span>
                  {pinned && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Your dentist</span>}
                  <DemoDataPill />
                </div>
                <div className="text-xs text-muted">
                  {d.neighborhood} · {d.distanceMiles} mi ·{' '}
                  <span className={d.inNetwork ? 'font-medium text-save' : 'font-medium text-warn'}>
                    {d.inNetwork ? 'In network' : 'Out of network'}
                  </span>
                  {!d.acceptingNew && ' · not accepting new patients'}
                </div>
              </div>
              <div className="md:text-right">
                <span className="text-xs text-muted md:hidden">Your cost </span>
                <span className="tabular font-semibold">{formatMoney(q.yourCost)}</span>
                {q.vsCheapest > 0 && <span className="tabular block text-[11px] text-muted">{formatMoney(q.vsCheapest, { signed: true })} vs cheapest</span>}
              </div>
              <div className="tabular text-right text-sm text-muted">
                <span className="text-xs md:hidden">In: </span>
                {formatMoney(q.inNetworkCost)}
              </div>
              <div className="tabular col-span-2 text-right text-sm text-muted md:col-span-1">
                <span className="text-xs md:hidden">Out of network: </span>
                {formatMoney(q.outOfNetworkCost)}
                <span className="block text-[11px]">incl. {formatMoney(q.outOfNetworkExtra)} balance bill</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
