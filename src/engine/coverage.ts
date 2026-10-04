import { CDT } from "./cdt";
import type { PlanRules } from "./types";

/** Coverage for a named service follows the plan's category mapping. */
export function serviceCoverage(rules: PlanRules, code: string) {
  const category = CDT[code]?.category;
  const serviceClass = category ? rules.categoryClass[category] : "excluded";
  const covered = rules.kind === "insurance" && serviceClass !== "excluded";
  return {
    inNetwork: covered ? rules.coinsurance.inNetwork[serviceClass] : 0,
    outOfNetwork: covered ? rules.coinsurance.outOfNetwork[serviceClass] : 0,
    waitingMonths: covered ? rules.waitingPeriodMonths[serviceClass] : 0,
    limits: rules.frequencyLimits.filter((limit) => limit.codes.includes(code)),
    deductibleApplies:
      covered && rules.deductible.appliesTo.includes(serviceClass),
  };
}
