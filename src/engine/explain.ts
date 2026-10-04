import { CDT, nameOf } from "./cdt";
import { formatDate } from "./dates";
import { pct, usd } from "./format";
import type { AdjudicatedLine, PlanRules, WaterfallKey } from "./types";

// One plain sentence per waterfall step, citing the plan section. Every number comes from the engine.
// The Bedrock explainer (AWS) must return the same shape and pass verifyNumbers before display.

export interface ExplainedStep {
  key: WaterfallKey;
  text: string;
  section?: string;
  /** AWS only: Automated Reasoning's verdict on the engine's plan-pays amount, proved against the plan document. */
  reasoning?: { verdict: string; claim: string; premises: string };
  /** AWS only: Winnow's plain-language gate; 'rewritten' when the sentence was reworded for clarity. */
  clarity?: "plain" | "rewritten";
}

export interface Explainer {
  explain(line: AdjudicatedLine, rules: PlanRules): Promise<ExplainedStep[]>;
}

const CLASS_NAME = {
  preventive: "Preventive",
  basic: "Basic",
  major: "Major",
  ortho: "Orthodontic",
  excluded: "Excluded",
} as const;

/** "basic and major": the classes this plan's deductible applies to (the line's own class when the rules aren't given). */
function deductibleClasses(line: AdjudicatedLine, rules?: PlanRules): string {
  const names = (rules?.deductible.appliesTo ?? [line.serviceClass]).map((c) => CLASS_NAME[c].toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "covered");
}

/** `rules` (the plan in force for the line's year) lets the deductible sentence name the classes the plan really applies it to. */
export function explainLine(line: AdjudicatedLine, rules?: PlanRules): ExplainedStep[] {
  const name = nameOf(line).replace(/^./, (c) => c.toLowerCase());
  const category = CDT[line.cdt]?.category;
  return line.waterfall.map((step) => {
    const amount = usd(Math.abs(step.delta));
    const s = (text: string): ExplainedStep => ({
      key: step.key,
      text,
      section: step.section,
    });
    switch (step.key) {
      case "fee":
        return s(
          `${line.feeSource?.kind === "demo" ? "The demo fee" : line.feeSource?.kind === "benchmark" ? "The benchmark fee" : "The fee supplied"} for the ${name} is ${usd(line.billed)}.`,
        );
      case "networkDiscount":
        return s(
          `The ${line.allowanceSource?.kind === "contract" ? "confirmed contracted" : line.allowanceSource?.kind === "demo" ? "demo in-network" : "estimated in-network"} fee of ${usd(line.allowed)} replaces the ${usd(line.billed)} fee, taking ${amount} off.`,
        );
      case "membershipDiscount":
        return s(
          line.memberOwes === 0
            ? `Your membership fee already covers this ${name}.`
            : `Your dentist's membership plan takes ${amount} off the fee.`,
        );
      case "coinsurance":
        return s(
          `${CLASS_NAME[line.serviceClass]} services like this ${category === "endodontics" ? "root canal" : name} are paid at ${pct(line.coinsuranceRate)} of the ${usd(line.allowed)} ${line.balanceBill > 0 ? "plan allowance" : "allowed fee"}, which takes ${amount} off.`,
        );
      case "alternateBenefit":
        return s(
          `On back teeth the plan pays tooth-colored fillings at the silver-filling fee (${usd(line.benefitBase)} instead of ${usd(line.allowed)}), adding ${amount} to your share.`,
        );
      case "deductible":
        return s(
          `The first ${usd(line.deductibleApplied)} of ${line.year} ${deductibleClasses(line, rules)} care is yours (the deductible), adding ${amount} to your share.`,
        );
      case "maxCap":
        return s(
          `Only ${usd(line.maxRemainingBefore)} of your ${line.serviceClass === "ortho" ? "orthodontic lifetime maximum" : `${line.year} annual max`} is left, so the plan pays ${usd(line.planPaid)} instead of ${usd(line.planShare)} and you pay the other ${amount}.`,
        );
      case "denied":
        return s(
          `The plan pays nothing here. ${line.denied?.detail ?? ""}`.trim(),
        );
      case "youPay":
        if (line.pricingWarning)
          return s(
            `Budget ${usd(line.memberOwes)} until ${line.pricingWarning.startsWith("Previous crown") ? "replacement eligibility" : "the insurer allowance"} is confirmed. This is not a coverage denial.`,
          );
        return s(
          `You pay ${usd(line.memberOwes)}${line.balanceBill > 0 ? `, including ${usd(line.balanceBill)} your out-of-network dentist bills above the plan's allowance` : ""}${CDT[line.cdt]?.prepDated ? `. For crowns the plan year is set by the preparation appointment (${formatDate(line.date)})` : ""}.`,
        );
    }
  });
}

export const localExplainer: Explainer = {
  explain: async (line, rules) => explainLine(line, rules),
};

/** Dollar amounts in a sentence. */
export function dollarsIn(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(\.\d{1,2})?/g)].map(
    (m) => Number(m[1].replace(/,/g, "") + (m[2] ?? "")),
  );
}

/** Every dollar figure shown must trace back to an engine output, never to model text. */
export function verifyNumbers(
  text: string,
  line: AdjudicatedLine,
): { ok: boolean; unknown: number[] } {
  const known = new Set<number>(
    [
      line.billed,
      line.allowed,
      line.benefitBase,
      line.deductibleApplied,
      line.planShare,
      line.planPaid,
      line.capReduction,
      line.memberOwes,
      line.balanceBill,
      line.maxRemainingBefore,
      ...line.waterfall.flatMap((s) => [Math.abs(s.delta), s.running]),
    ].map((n) => Math.round(n * 100)),
  );
  const unknown = dollarsIn(text).filter(
    (n) => !known.has(Math.round(n * 100)),
  );
  return { ok: unknown.length === 0, unknown };
}
