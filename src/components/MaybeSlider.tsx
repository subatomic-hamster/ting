import { useId } from 'react';
import type { ProcedureItem } from '../contracts';
import { formatPercent } from '../lib/format';
import { useAppStore, useResult } from '../store';

export function MaybeSlider({ item }: { item: ProcedureItem }) {
  const updateProcedure = useAppStore((s) => s.updateProcedure);
  const { comparison } = useResult();
  const id = useId();
  const tip = comparison.find((r) => r.tippingPoint?.procedureId === item.id);
  const value = Math.round((item.likelihood ?? 1) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {item.label}
          {item.tooth ? ` #${item.tooth}` : ''}
        </label>
        <span className="tabular text-sm font-semibold">{value}% likely</span>
      </div>
      <div className="relative mt-1">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => updateProcedure(item.id, { likelihood: Number(e.target.value) / 100 })}
          className="w-full accent-brand-600"
          aria-valuetext={`${value}% likely`}
        />
        {tip?.tippingPoint && (
          <span
            className="pointer-events-none absolute -bottom-3 h-3 w-0.5 -translate-x-1/2 bg-violet-600"
            style={{ left: `${tip.tippingPoint.likelihood * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        {tip?.tippingPoint
          ? `Tipping point ${formatPercent(tip.tippingPoint.likelihood)}: above it, ${tip.name} pays for itself.`
          : 'No tipping point: the same plan wins at any likelihood.'}
        {value === 100 && ' At 100% this counts as certain and joins your schedule.'}
      </p>
    </div>
  );
}
