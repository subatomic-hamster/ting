import { useMemo } from "react";
import { round2 } from "../engine/adjudicate";
import { priceOption } from "../engine/compare";
import type { PlanRules, Profile } from "../engine/types";
import { formatMoney } from "../lib/format";
import { useAppStore, useProfile } from "../store";

/** The same planned work, priced as if every item were with an in-network or an out-of-network dentist. */
const inNetwork = (p: Profile, yes: boolean): Profile => ({
  ...p,
  procedures: p.procedures.map((x) => ({ ...x, inNetwork: yes, allowedFee: undefined })),
});

function allowance(plan: PlanRules): string {
  const o = plan.outOfNetwork;
  return o.basis === "ucr"
    ? `only the ${o.percentile}th-percentile fee (the amount ${o.percentile}% of local dentists charge or less)`
    : "only the in-network fee schedule";
}

/** In vs out of network for the member's planned work, with the store's network switch (same one as Treatment). */
export function NetworkChoice() {
  const profile = useProfile();
  const plans = useAppStore((s) => s.plans);
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const rows = useMemo(
    () =>
      plans
        .filter((p) => p.kind === "insurance")
        .map((plan) => {
          const inCost = priceOption(inNetwork(profile, true), plan).careCost;
          const outCost = priceOption(inNetwork(profile, false), plan).careCost;
          return { plan, inCost, outCost, extra: round2(outCost - inCost) };
        }),
    [profile, plans],
  );
  const current = rows.find((r) => r.plan.id === profile.currentPlan.id) ?? rows[0];

  return (
    <div>
      <p className="text-sm text-muted">
        Your out-of-pocket care cost for the planned work, before premiums.
        The plan options above are priced as if your dentist is:
      </p>
      <div role="radiogroup" aria-label="Dentist network" className="mt-3 flex flex-wrap gap-2">
        {(["in", "out"] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={network === n}
            className={network === n ? "btn-primary" : "btn-secondary"}
            onClick={() => setNetwork(n)}
          >
            {n === "in" ? "In-network" : "Out-of-network"}
          </button>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
        {rows.map((r) => (
          <li key={r.plan.id} className="py-3">
            <p className="font-medium">
              {r.plan.name}
              {r.plan.id === profile.currentPlan.id && (
                <span className="font-normal text-muted"> (current)</span>
              )}
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-y-0.5">
              <dt className="text-muted">In-network dentist</dt>
              <dd className="tabular text-right">{formatMoney(r.inCost)}</dd>
              <dt className="text-muted">Out-of-network dentist</dt>
              <dd className="tabular text-right">{formatMoney(r.outCost)}</dd>
            </dl>
          </li>
        ))}
      </ul>
      {current && (
        <p className="mt-3 text-sm" data-testid="network-note">
          {current.extra > 0
            ? `Out of network you'd pay ${formatMoney(current.extra)} more on ${current.plan.name} because it allows ${allowance(current.plan)}, and the dentist can bill you the rest.`
            : `On ${current.plan.name} your planned work costs the same in or out of network.`}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Confirm with your dentist and insurer whether they participate in the
        plan’s network.
      </p>
    </div>
  );
}
