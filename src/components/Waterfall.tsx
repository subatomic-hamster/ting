import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { explainLine, verifyNumbers } from "../engine/explain";
import type { AdjudicatedLine, PlanRules } from "../engine/types";
import { explainQuery } from "../lib/explainQuery";
import { formatMoney } from "../lib/format";
import { isTotal, waterfallBars } from "../lib/geometry";
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
  return (
    <figure aria-label={`Estimated cost for ${name}`}>
      <div className="mb-5">
        <p className="text-base">
          {line.pricingWarning
            ? "Budget until confirmed"
            : "Estimated amount you pay"}
        </p>
        <p className="tabular mt-1 text-[32px] leading-[38px] font-medium">
          {formatMoney(line.memberOwes)}
        </p>
      </div>
      <ol
        aria-label="Horizontal cost waterfall"
        className="divide-y divide-line text-base"
      >
        {line.waterfall.map((step, i) => (
          <li key={step.key} className="py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className={step.key === "youPay" ? "font-medium" : ""}>
                {step.label}
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
            {!isTotal(step) && (
              <p className="mt-1 text-sm text-muted">
                Running total {formatMoney(step.running)}
              </p>
            )}
          </li>
        ))}
      </ol>
      <details className="mt-4 border-t border-line">
        <summary className="text-brand-700">Cost breakdown</summary>
        <ol className="divide-y divide-line">
          {line.waterfall.map((s) => {
            const polished = explained.data?.find((e) => e.key === s.key);
            const text =
              polished && verifyNumbers(polished.text, line).ok
                ? polished.text
                : template.find((e) => e.key === s.key)?.text;
            return (
              <li key={s.key} className="py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular">
                    {formatMoney(
                      s.key === "fee" || s.key === "youPay"
                        ? s.running
                        : s.delta,
                      { signed: s.key !== "fee" && s.key !== "youPay" },
                    )}
                  </span>
                </div>
                {text && <p className="mt-2 text-base text-muted">{text}</p>}
                {s.section && (
                  <p className="mt-2 text-xs text-muted">
                    Plan rule: {s.section}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </figure>
  );
}
