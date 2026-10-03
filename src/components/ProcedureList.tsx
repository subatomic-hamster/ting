import { formatDate, formatMoney, formatPercent, procedureName } from '../lib/format';
import { useActive, useAppStore } from '../store';
import { CloseIcon, LockIcon } from './Icons';

export function ProcedureList({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string) => void }) {
  const procedures = useAppStore((s) => s.profile.procedures);
  const removeProcedure = useAppStore((s) => s.removeProcedure);
  const owes = new Map(useActive().lines.map((l) => [l.id, l.memberOwes]));

  if (!procedures.length) {
    return <p className="text-sm text-muted">Nothing yet. Describe your treatment above.</p>;
  }

  return (
    <ul className="space-y-2">
      {procedures.map((p) => {
        const selected = p.id === selectedId;
        const name = procedureName(p);
        return (
          <li key={p.id}>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'}`}>
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                aria-pressed={selected}
                onClick={() => onSelect(p.id)}
              >
                {p.locked && <LockIcon className="text-slate-500" aria-label="Urgent" />}
                <span className="font-medium">{name}</span>
                <span className="font-mono text-xs text-muted">{p.cdt}</span>
                {p.likelihood !== undefined && p.likelihood < 1 && (
                  <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">maybe · {formatPercent(p.likelihood)}</span>
                )}
                <span className="w-full text-xs text-muted">
                  Fee {formatMoney(p.fee)} · you pay <span className="tabular font-medium text-ink">{formatMoney(owes.get(p.id) ?? 0)}</span>
                  {p.deadline && ` · dentist's deadline ${formatDate(p.deadline, { year: true })}`}
                  {!p.inNetwork && ' · out of network'}
                </span>
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label={`Remove ${name}`}
                onClick={() => removeProcedure(p.id)}
              >
                <CloseIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
