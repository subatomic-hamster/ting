import { useId, useState } from 'react';
import type { ProcedureItem } from '../contracts';
import { FEE_SCHEDULE, feeFor } from '../fixtures/feeSchedule';
import { formatPercent } from '../lib/format';
import { useAppStore } from '../store';

/** Low-confidence items ask the member to confirm what the AI read. */
export function ConfirmCard({ item }: { item: ProcedureItem }) {
  const updateProcedure = useAppStore((s) => s.updateProcedure);
  const [editing, setEditing] = useState(false);
  const [cdt, setCdt] = useState(item.cdt);
  const [tooth, setTooth] = useState(item.tooth ? String(item.tooth) : '');
  const id = useId();

  const save = () => {
    const fee = feeFor(cdt);
    if (!fee) return;
    const n = Number(tooth);
    updateProcedure(item.id, {
      cdt: fee.cdt,
      label: fee.label,
      serviceClass: fee.serviceClass,
      feeIn: fee.feeIn,
      feeOut: fee.feeOut,
      feeRange: fee.feeRange,
      tooth: Number.isInteger(n) && n >= 1 && n <= 32 ? n : undefined,
      confidence: 1,
    });
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3" role="group" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} className="text-sm">
        We think this is a <strong>{item.label.toLowerCase()}</strong>
        {item.tooth ? (
          <>
            {' '}
            on <strong>#{item.tooth}</strong>
          </>
        ) : null}{' '}
        <span className="text-muted">({formatPercent(item.confidence)} sure)</span>. Correct?
      </p>
      {!editing ? (
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-primary px-3 py-1.5" onClick={() => updateProcedure(item.id, { confidence: 1 })}>
            Yes
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
            Procedure
            <select className="mt-0.5 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink" value={cdt} onChange={(e) => setCdt(e.target.value)}>
              {FEE_SCHEDULE.map((f) => (
                <option key={f.cdt} value={f.cdt}>
                  {f.label} ({f.cdt})
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-20 flex-col text-xs text-muted">
            Tooth #
            <input
              inputMode="numeric"
              className="mt-0.5 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
              value={tooth}
              onChange={(e) => setTooth(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="—"
            />
          </label>
          <button type="button" className="btn-primary px-3 py-1.5" onClick={save}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
