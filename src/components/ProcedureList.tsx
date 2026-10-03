import type { ProcedureItem } from '../contracts';
import { formatPercent } from '../lib/format';
import { useAppStore } from '../store';
import { ConfirmCard } from './ConfirmCard';
import { CloseIcon, LockIcon } from './Icons';

export const CONFIRM_THRESHOLD = 0.9;

const SOURCE: Record<ProcedureItem['source'], string> = {
  typed: 'Typed',
  voice: 'Voice',
  photo: 'Photo',
  claim: 'Claim',
  upload: 'Upload',
  seed: 'Quote',
};

export function ProcedureList({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string) => void }) {
  const procedures = useAppStore((s) => s.procedures);
  const removeProcedure = useAppStore((s) => s.removeProcedure);

  if (!procedures.length) {
    return <p className="text-sm text-muted">Nothing yet. Describe your treatment above.</p>;
  }

  return (
    <ul className="space-y-2">
      {procedures.map((p) => {
        const selected = p.id === selectedId;
        return (
          <li key={p.id} className="space-y-2">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                aria-pressed={selected}
                onClick={() => onSelect(p.id)}
              >
                {p.locked && <LockIcon className="text-slate-500" aria-label="Locked" />}
                <span className="font-medium">
                  {p.label}
                  {p.tooth ? ` #${p.tooth}` : ''}
                </span>
                <span className="font-mono text-xs text-muted">{p.cdt}</span>
                {p.likelihood !== undefined && p.likelihood < 1 && (
                  <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
                    maybe · {formatPercent(p.likelihood)}
                  </span>
                )}
                <span className="text-xs text-muted">
                  {SOURCE[p.source]} · {formatPercent(p.confidence)} confidence
                </span>
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label={`Remove ${p.label}${p.tooth ? ` #${p.tooth}` : ''}`}
                onClick={() => removeProcedure(p.id)}
              >
                <CloseIcon />
              </button>
            </div>
            {p.confidence < CONFIRM_THRESHOLD && <ConfirmCard item={p} />}
          </li>
        );
      })}
    </ul>
  );
}
