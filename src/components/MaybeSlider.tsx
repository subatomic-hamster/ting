import { useId } from 'react';
import type { PlannedProcedure } from '../engine/types';
import { procedureName } from '../lib/format';
import { useAppStore, useComparison } from '../store';

export function MaybeSlider({ item }: { item: PlannedProcedure }) {
  const updateProcedure = useAppStore((s) => s.updateProcedure);
  const tip = useComparison().tipping.find((t) => t.procedureId === item.id);
  const id = useId();
  const value = Math.round((item.likelihood ?? 1) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {procedureName(item)}
        </label>
        <span className="tabular text-sm font-semibold">{value}% likely</span>
      </div>
      <div className="relative mt-1">
        <input
          id={id}
          type="range"
          min={5}
          max={95}
          step={5}
          value={value}
          onChange={(e) => updateProcedure(item.id, { likelihood: Number(e.target.value) / 100 })}
          className="w-full accent-brand-600"
          aria-valuetext={`${value}% likely`}
        />
        {tip && (
          <span
            className="pointer-events-none absolute -bottom-3 h-3 w-0.5 -translate-x-1/2 bg-brand-600"
            style={{ left: `${((tip.likelihood - 0.05) / 0.9) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        {tip ? `Tipping point: ${tip.text}` : 'No tipping point: the same option wins at any likelihood.'}
      </p>
    </div>
  );
}
