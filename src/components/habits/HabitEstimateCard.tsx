import { habitAdjustment, type Adherence } from '../../habits/analytics';
import { useHabitStore } from '../../habits/store';
import { serviceClassOf } from '../../engine/adjudicate';
import { formatPercent, procedureName } from '../../lib/format';
import { useAppStore } from '../../store';

export function HabitEstimateCard({ adherence }: { adherence: Adherence }) {
  const procedures = useAppStore((s) => s.profile.procedures);
  const plan = useAppStore((s) => s.profile.currentPlan);
  const optedIn = useHabitStore((s) => s.consent.optedIn);
  const baseLikelihood = useHabitStore((s) => s.baseLikelihood);
  const applyAdjustment = useHabitStore((s) => s.applyAdjustment);
  const undoAdjustment = useHabitStore((s) => s.undoAdjustment);
  const maybes = procedures.filter((p) => p.likelihood !== undefined).map((p) => ({ ...p, serviceClass: serviceClassOf(p.cdt, plan) }));

  if (!maybes.length) {
    return (
      <p className="text-sm text-muted">
        No “maybe” work on file. When your dentist says you <em>might</em> need a filling or root canal, your brushing record can nudge how likely Ting
        assumes it is, by at most 10 points, and only if you apply it.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {maybes.map((p) => {
        // Always nudge from the original estimate, so applying twice never stacks.
        const base = baseLikelihood[p.id] ?? p.likelihood ?? 0;
        const adj = optedIn ? habitAdjustment({ ...p, likelihood: base }, adherence) : null;
        const applied = baseLikelihood[p.id] !== undefined;
        return (
          <li key={p.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {procedureName(p)}
              </span>
              <span className="tabular text-muted">now assumed {formatPercent(p.likelihood ?? 0)} likely</span>
            </div>
            {adj ? (
              <>
                <p className="mt-1 text-muted">{adj.reason}</p>
                {applied ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-save">
                    Applied ({formatPercent(base)} → {formatPercent(adj.to)}). The estimate and plan comparison were repriced.
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => undoAdjustment(p.id)}>
                      Undo
                    </button>
                  </p>
                ) : (
                  <button type="button" className="btn-secondary mt-2" onClick={() => applyAdjustment(p.id, base, adj.to)}>
                    Use {formatPercent(adj.to)} instead
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1 text-muted">
                {p.serviceClass === 'major' || p.serviceClass === 'ortho'
                  ? 'Brushing doesn’t change this one: it’s major or orthodontic work, so only your dentist’s assessment counts.'
                  : optedIn
                    ? 'Not enough brushing data yet (needs 14+ days), or it wouldn’t change the estimate.'
                    : 'Opt in to SmileStreak to use your brushing record here.'}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
