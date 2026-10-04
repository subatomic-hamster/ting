import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { explainLine, verifyNumbers } from "../engine/explain";
import type { AdjudicatedLine, PlanRules } from "../engine/types";
import { explainQuery } from "../lib/explainQuery";
import { formatMoney } from "../lib/format";
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
  const fee = line.waterfall.find((s) => s.key === "fee")?.running ?? 0;
  const discount = line.waterfall.find((s) => s.key === "networkDiscount");
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
      <dl className="divide-y divide-line text-base">
        {[
          ["Dentist’s fee", fee],
          ["Plan discount", discount ? Math.abs(discount.delta) : 0],
          ["Plan pays", line.planPaid],
          ["You pay", line.memberOwes],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <dt>{label}</dt>
            <dd className="tabular shrink-0 font-medium">
              {formatMoney(value as number)}
            </dd>
          </div>
        ))}
      </dl>
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
