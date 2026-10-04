import { useState } from "react";
import { CDT, isPosterior } from "../engine/cdt";
import type { PlannedProcedure } from "../engine/types";
import { useAppStore } from "../store";
export function PriceEditor({ procedure }: { procedure: PlannedProcedure }) {
  const scope = useAppStore(
    (s) =>
      `${s.profile.currentPlan.id}:${s.profile.currentPlan.version}:${s.network}`,
  );
  return <Editor key={`${procedure.id}:${scope}`} procedure={procedure} />;
}
function Editor({ procedure }: { procedure: PlannedProcedure }) {
  const needsAlternate =
    useAppStore((s) => s.profile.currentPlan.alternateBenefit) &&
    !!CDT[procedure.cdt]?.amalgamEquivalent &&
    isPosterior(procedure.tooth);
  const plan = useAppStore((s) => s.profile.currentPlan);
  const network = useAppStore((s) => s.network);
  const source = procedure.allowedFeeSource;
  const scopeMatches =
    (!source?.planId || source.planId === plan.id) &&
    (!source?.planVersion || source.planVersion === plan.version) &&
    (!source?.network || source.network === network);
  const [alternate, setAlternate] = useState(
    scopeMatches ? String(procedure.alternateAllowedFee ?? "") : "",
  );
  const [fee, setFee] = useState(String(procedure.fee));
  const [allowed, setAllowed] = useState(
    scopeMatches && procedure.allowedFeeSource?.kind === "contract"
      ? String(procedure.allowedFee ?? "")
      : "",
  );
  const [message, setMessage] = useState("");
  const update = useAppStore((s) => s.updateProcedure);
  return (
    <details className="mt-4 border-t border-line">
      <summary className="text-brand-700">
        Update dentist fee and insurer allowance
      </summary>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const billed = Number(fee);
          const alt = alternate.trim() === "" ? undefined : Number(alternate);
          const allowance = allowed.trim() === "" ? undefined : Number(allowed);
          if (
            !Number.isFinite(billed) ||
            billed <= 0 ||
            (allowance !== undefined &&
              (!Number.isFinite(allowance) ||
                allowance < 0 ||
                allowance > billed)) ||
            (alt !== undefined &&
              (!Number.isFinite(alt) || alt < 0 || alt > billed))
          ) {
            setMessage(
              "Enter a positive fee and an allowance no greater than the fee.",
            );
            return;
          }
          update(procedure.id, {
            fee: billed,
            feeSource: { kind: "quote", label: "Dentist quote entered by you" },
            allowedFee: allowance,
            alternateAllowedFee: needsAlternate ? alt : undefined,
            allowedFeeSource:
              allowance === undefined
                ? undefined
                : {
                    kind: "contract",
                    label: "Insurer allowance entered by you",
                    planId: useAppStore.getState().profile.currentPlan.id,
                    planVersion:
                      useAppStore.getState().profile.currentPlan.version,
                    network: useAppStore.getState().network,
                  },
            allowancePending: allowance === undefined,
          });
          setMessage("Updated. Your quote is used for this estimate.");
        }}
      >
        <label className="block">
          Dentist’s fee ($)
          <input
            type="number"
            required
            min="0.01"
            max="1000000"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="mt-1 block w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          Confirmed insurer allowance ($)
          <input
            type="number"
            min="0"
            max={fee}
            step="0.01"
            value={allowed}
            onChange={(e) => setAllowed(e.target.value)}
            className="mt-1 block w-full border border-line px-3 py-2"
          />
        </label>
        <>
          {needsAlternate && (
            <label className="block">
              Confirmed alternate-benefit allowance ($)
              <input
                type="number"
                min="0"
                max={fee}
                step="0.01"
                value={alternate}
                onChange={(e) => setAlternate(e.target.value)}
                className="mt-1 block w-full border border-line px-3 py-2"
              />
              <span className="mt-2 block text-xs text-muted">
                This plan may pay a tooth-colored filling at the silver-filling
                rate. Confirm that benefit base separately; a sample rate cannot
                fill this gap.
              </span>
            </label>
          )}
        </>
        <p className="text-xs text-muted">
          Leave blank if unknown. The estimate budgets the full fee until
          confirmed.
        </p>
        <button className="btn-secondary" type="submit">
          Update estimate
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
