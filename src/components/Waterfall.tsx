import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { explainLine, verifyNumbers } from "../engine/explain";
import type { AdjudicatedLine, PlanRules, WaterfallKey } from "../engine/types";
import { explainQuery } from "../lib/explainQuery";
import { formatMoney } from "../lib/format";
import { isTotal, waterfallBars } from "../lib/geometry";
import { GlossaryTerm } from "./GlossaryTerm";
import { ProofBadge, VerifiedBadge, VerifiedMark, type Verification } from "./VerifiedBadge";

const TERM: Partial<Record<WaterfallKey, "deductible" | "coinsurance" | "annual maximum">> = {
  deductible: "deductible",
  coinsurance: "coinsurance",
  maxCap: "annual maximum",
};

export function Waterfall({
  line,
  rules,
  name,
}: {
  line: AdjudicatedLine;
  rules: PlanRules;
  name: string;
}) {
  const template = explainLine(line);
  const explained = useQuery(explainQuery(line, rules, api));
  const bars = waterfallBars(line.waterfall);
  // Words come from the API (Bedrock in AWS); a sentence is shown only if every dollar in it matches the engine,
  // otherwise the template sentence (built from the engine's numbers) is shown instead.
  const steps = line.waterfall.map((s) => {
    const polished = explained.data?.find((e) => e.key === s.key);
    const text = polished && verifyNumbers(polished.text, line).ok ? polished.text : template.find((e) => e.key === s.key)?.text;
    const state: Verification = explained.isPending ? "pending" : text && verifyNumbers(text, line).ok ? "verified" : "unverified";
    return { step: s, polished, text, state };
  });
  const overall: Verification = steps.some((s) => s.state === "unverified")
    ? "unverified"
    : steps.some((s) => s.state === "pending")
      ? "pending"
      : "verified";

  return (
    <figure aria-label={`Estimated cost for ${name}`}>
      <div className="mb-4">
        <p className="text-base">
          {line.pricingWarning
            ? "Budget until confirmed"
            : "Estimated amount you pay"}
        </p>
        <p className="tabular mt-1 text-[32px] leading-[38px] font-medium">
          {formatMoney(line.memberOwes)}
        </p>
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          <VerifiedBadge state={overall} />
        </p>
      </div>
      <ol
        aria-label="Horizontal cost waterfall"
        className="divide-y divide-line text-base"
      >
        {steps.map(({ step, polished, text, state }, i) => {
          const term = TERM[step.key];
          return (
            <li key={step.key} className="py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className={step.key === "youPay" ? "font-medium" : ""}>
                  {term ? <GlossaryTerm term={term}>{step.label}</GlossaryTerm> : step.label}
                </span>
                <span className="tabular shrink-0 font-medium">
                  {formatMoney(isTotal(step) ? step.running : step.delta, {
                    signed: !isTotal(step),
                  })}
                </span>
              </div>
              <div
                className="relative mt-2 h-4 w-full rounded-sm bg-paper"
                aria-hidden="true"
              >
                <div
                  className={`absolute inset-y-0 rounded-sm ${step.key === "youPay" ? "bg-ink" : bars[i].tone === "down" ? "bg-plan" : bars[i].tone === "up" ? "bg-cost" : bars[i].tone === "flat" ? "bg-line" : "bg-muted"}`}
                  style={{
                    left: `${bars[i].leftPct}%`,
                    width: `${Math.max(bars[i].widthPct, bars[i].tone === "flat" ? 0.6 : 0)}%`,
                  }}
                />
              </div>
              {text && <p className="mt-2 text-base text-ink/80">{text}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {!isTotal(step) && (
                  <span className="tabular">Running total {formatMoney(step.running)}</span>
                )}
                <VerifiedMark state={state} />
                {polished?.reasoning && (
                  <ProofBadge verdict={polished.reasoning.verdict} claim={polished.reasoning.claim} />
                )}
                {step.section && <span>Plan rule: {step.section}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
