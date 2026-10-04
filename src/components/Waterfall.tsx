import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { explainLine, verifyNumbers } from "../engine/explain";
import type { AdjudicatedLine, PlanRules, WaterfallKey } from "../engine/types";
import { explainQuery } from "../lib/explainQuery";
import { formatMoney } from "../lib/format";
import { isTotal, waterfallBars } from "../lib/geometry";
import { EstimateFooter } from "./EstimateFooter";
import { GlossaryTerm } from "./GlossaryTerm";

const TERM: Partial<Record<WaterfallKey, "deductible" | "coinsurance" | "annual maximum">> = {
  deductible: "deductible",
  coinsurance: "coinsurance",
  maxCap: "annual maximum",
};

/**
 * Where a step's dollar figure comes from. Plan rules (coinsurance %, deductible, max) are "From your plan";
 * anything built on a demo, benchmark or quoted fee is "Estimated". Only a confirmed contract fee counts as plan-derived.
 */
function provenance(
  step: WaterfallKey,
  line: AdjudicatedLine,
): { tag: "From your plan" | "Estimated"; note?: string } {
  switch (step) {
    case "coinsurance":
    case "deductible":
    case "maxCap":
    case "denied":
      return { tag: "From your plan" };
    case "networkDiscount":
      return line.allowanceSource?.kind === "contract"
        ? { tag: "From your plan", note: line.allowanceSource.label }
        : { tag: "Estimated", note: line.allowanceSource?.label };
    case "fee":
      return line.feeSource?.kind === "contract"
        ? { tag: "From your plan", note: line.feeSource.label }
        : { tag: "Estimated", note: line.feeSource?.label };
    default:
      return { tag: "Estimated" };
  }
}

const TAG_STYLE = {
  "From your plan": "bg-save/10 text-save ring-save/30",
  Estimated: "bg-paper text-muted ring-line",
} as const;

function SourceTag({ tag, note }: { tag: keyof typeof TAG_STYLE; note?: string }) {
  return (
    <span
      className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-normal whitespace-nowrap ring-1 ${TAG_STYLE[tag]}`}
      title={note}
    >
      {tag}
    </span>
  );
}

export function Waterfall({
  line,
  rules,
  name,
}: {
  line: AdjudicatedLine;
  rules: PlanRules;
  name: string;
}) {
  const template = explainLine(line, rules);
  const explained = useQuery(explainQuery(line, rules, api));
  const bars = waterfallBars(line.waterfall);
  // Words come from the API (Bedrock in AWS); a sentence is shown only if every dollar in it matches the engine,
  // otherwise the template sentence (built from the engine's numbers) is shown instead.
  const steps = line.waterfall.map((s) => {
    const polished = explained.data?.find((e) => e.key === s.key);
    const text = polished && verifyNumbers(polished.text, line).ok ? polished.text : template.find((e) => e.key === s.key)?.text;
    return { step: s, text };
  });

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
          <SourceTag tag="Estimated" />
        </p>
        <EstimateFooter />
        <p className="mt-1 text-xs text-muted">
          <strong className="font-medium text-ink">From your plan</strong> is a
          rule in your benefits summary (the section is named).{" "}
          <strong className="font-medium text-ink">Estimated</strong> is built
          on a demo or quoted fee.
        </p>
      </div>
      <ol
        aria-label="Horizontal cost waterfall"
        className="divide-y divide-line text-base"
      >
        {steps.map(({ step, text }, i) => {
          const term = TERM[step.key];
          return (
            <li key={step.key} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className={`min-w-0 break-words ${step.key === "youPay" ? "font-medium" : ""}`}>
                  {term ? <GlossaryTerm term={term}>{step.label}</GlossaryTerm> : step.label}
                  <SourceTag {...provenance(step.key, line)} />
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
                {step.section && <span>Plan rule: {step.section}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
