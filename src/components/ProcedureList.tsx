import { useMemo, useState } from "react";
import { placementReasons } from "../engine/reasons";
import type { PlannedProcedure } from "../engine/types";
import { formatDate, formatMoney, groupVisits, visitName } from "../lib/format";
import { HORIZON, useActive, useAppStore } from "../store";
import { CloseIcon, LockIcon } from "./Icons";

/** One card per appointment: "3 × Tooth-colored filling" is one visit, removed or selected together. */
export function ProcedureList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const procedures = useAppStore((s) => s.profile.procedures);
  const removeProcedure = useAppStore((s) => s.removeProcedure);
  const restore = useAppStore((s) => s.restoreProcedures);
  const [undo, setUndo] = useState<{
    before: PlannedProcedure[];
    ids: string[];
    name: string;
  }>();
  const active = useActive();
  const profile = useAppStore((s) => s.profile);
  const owes = new Map(active.lines.map((l) => [l.id, l.memberOwes]));
  const reasons = useMemo(
    () => placementReasons(profile, active, { horizon: HORIZON }),
    [profile, active],
  );

  if (!procedures.length && !undo) {
    return (
      <p className="text-sm text-muted">
        Nothing yet. Describe your treatment above.
      </p>
    );
  }

  return (
    <div>
      {undo && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3">
          <span>Removed {undo.name}.</span>
          <button
            className="btn-secondary"
            onClick={() => {
              restore(undo.before, undo.ids);
              setUndo(undefined);
            }}
          >
            Undo removal
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {groupVisits(procedures).map((group) => {
          const p = group[0];
          const selected = group.some((g) => g.id === selectedId);
          const name = visitName(group);
          const many = group.length > 1;
          const youPay = group.reduce((s, g) => s + (owes.get(g.id) ?? 0), 0);
          return (
            <li key={p.id}>
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${selected ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                  aria-pressed={selected}
                  onClick={() => onSelect(p.id)}
                >
                  {group.some((g) => g.locked) && (
                    <LockIcon className="text-muted" aria-label="Urgent" />
                  )}
                  <span className="font-medium">{name}</span>

                  {p.likelihood !== undefined && p.likelihood < 1 && (
                    <span className="w-full text-xs text-muted">
                      Only if needed
                    </span>
                  )}
                  <span className="w-full text-xs text-muted">
                    Fee {formatMoney(p.fee)}
                    {many && " each, one visit"} · you pay{" "}
                    <span className="tabular font-medium text-ink">
                      {formatMoney(youPay)}
                    </span>
                    {p.deadline &&
                      ` · dentist's deadline ${formatDate(p.deadline, { year: true })}`}
                    {!p.inNetwork && " · out of network"}
                  </span>
                  {reasons[p.id] && (
                    <span className="w-full text-xs text-ink/80">
                      {reasons[p.id].text}
                      {reasons[p.id].maxLeftAfter !== undefined && (
                        <span className="tabular text-muted">
                          {" "}
                          {reasons[p.id].year} annual max left after:{" "}
                          {formatMoney(reasons[p.id].maxLeftAfter ?? 0)}.
                        </span>
                      )}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="min-h-12 min-w-12 p-3 text-muted hover:bg-brand-50 hover:text-ink"
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    setUndo({
                      before: procedures,
                      ids: group.map((g) => g.id),
                      name,
                    });
                    group.forEach((g) => removeProcedure(g.id));
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
