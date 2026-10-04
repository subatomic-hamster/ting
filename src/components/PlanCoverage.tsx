import { PLAN_BASIS } from "../data/demo";
import { serviceCoverage } from "../engine/coverage";
import type { PlanRules } from "../engine/types";
import { formatMoney, formatPercent } from "../lib/format";
import { Section } from "./Section";

const COMMON = [
  ["Cleanings", "D1110"],
  ["Fillings", "D2392"],
  ["Checkups", "D0120"],
  ["Bitewing X-rays", "D0274"],
];
const OTHER = [
  ["Crowns", "D2740"],
  ["Root canals", "D3330"],
  ["Gum treatment", "D4341"],
  ["Extractions", "D7140"],
  ["Braces", "D8090"],
  ["Implants", "D6010"],
  ["Dentures", "D5110"],
  ["Nitrous oxide", "D9230"],
];
const percentage = (value: number) =>
  value > 0 ? formatPercent(value) : "Not covered";

function Service({
  rules,
  name,
  code,
}: {
  rules: PlanRules;
  name: string;
  code: string;
}) {
  const coverage = serviceCoverage(rules, code);
  return (
    <article className="rounded-lg border border-line p-5">
      <h3 className="text-lg font-medium">{name}</h3>
      <dl className="mt-3 space-y-2">
        <div className="flex flex-wrap justify-between gap-x-4">
          <dt className="text-muted">In-network</dt>
          <dd className="tabular font-medium">
            {percentage(coverage.inNetwork)}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4">
          <dt className="text-muted">Out-of-network</dt>
          <dd className="tabular">{percentage(coverage.outOfNetwork)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        {coverage.limits.length
          ? coverage.limits
              .map((f) => f.label.replace(/^[^:]+:\s*/, ""))
              .join(" · ")
          : "No frequency limit listed in these rules. Confirm with your insurer."}
      </p>
      {coverage.deductibleApplies && (
        <p className="mt-2 text-sm text-muted">Deductible applies.</p>
      )}
      {coverage.waitingMonths > 0 && (
        <p className="mt-2 text-sm">
          {coverage.waitingMonths}-month waiting period for new coverage.
        </p>
      )}
    </article>
  );
}

export function PlanCoverage({
  rules,
  title,
}: {
  rules: PlanRules;
  title: string;
}) {
  if (rules.kind !== "insurance")
    return (
      <Section title={title}>
        <p className="font-medium">{rules.name}</p>
        <p className="mt-3 text-muted">
          {rules.kind === "waive"
            ? "You pay the dentist’s full fee. This option has no insurance benefit."
            : `Membership costs ${formatMoney(rules.membership?.annualFee ?? rules.premiumMonthly * 12)} a year and discounts eligible work by ${formatPercent(rules.membership?.discount ?? 0)} at the participating office.`}
        </p>
      </Section>
    );
  return (
    <Section title={title}>
      <p className="text-lg font-medium">{rules.name}</p>
      {PLAN_BASIS[rules.id] && <p className="mt-1 text-xs text-muted">{PLAN_BASIS[rules.id]}</p>}
      <dl className="mt-5 rounded-lg bg-paper px-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:bg-transparent sm:px-0">
        {[
          ["Monthly premium", rules.premiumMonthly],
          ["Annual maximum", rules.annualMax],
          ["Deductible", rules.deductible.amount],
        ].map(([label, amount]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3 last:border-0 sm:block sm:rounded-lg sm:border-0 sm:bg-paper sm:p-4"
          >
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-medium">
              {formatMoney(amount as number)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 mb-4 text-muted">
        Percentages below show what the plan pays toward its allowed fee. Your
        share also depends on the deductible, annual maximum and any charge
        above that allowance.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {COMMON.map(([name, code]) => (
          <Service key={code} rules={rules} name={name} code={code} />
        ))}
      </div>
      {rules.alternateBenefit && (
        <p className="mt-4 text-sm text-muted">
          Back-tooth tooth-colored fillings use the silver-filling allowance.
          Confirm both allowances before estimating your share.
        </p>
      )}
      <details className="mt-6 border-t border-line" data-testid="plan-more">
        <summary className="text-brand-700">Show more plan details</summary>
        <div className="space-y-6 pt-3">
          <div>
            <h3 className="mb-4 text-lg font-medium">Other dental work</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {OTHER.map(([name, code]) => (
                <Service key={code} rules={rules} name={name} code={code} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-medium">Limits and eligibility</h3>
            <dl className="mt-3 space-y-4">
              <div>
                <dt className="font-medium">Annual maximum</dt>
                <dd className="mt-1 text-muted">
                  The plan pays up to {formatMoney(rules.annualMax)} each
                  calendar year. Preventive care{" "}
                  {rules.preventiveCountsTowardMax
                    ? "counts toward"
                    : "does not use"}{" "}
                  this maximum.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Deductible</dt>
                <dd className="mt-1 text-muted">
                  {formatMoney(rules.deductible.amount)} on{" "}
                  {rules.deductible.appliesTo.length
                    ? rules.deductible.appliesTo.join(" and ") + " care"
                    : "no service classes"}
                  .
                  {rules.q4DeductibleCarryover &&
                    " Amounts paid toward it in October–December also count toward next year’s deductible."}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Braces and orthodontics</dt>
                <dd className="mt-1 text-muted">
                  Lifetime maximum: {formatMoney(rules.orthoLifetimeMax)}.
                  Confirm age eligibility, installment payments and treatment
                  already in progress.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Out-of-network fees</dt>
                <dd className="mt-1 text-muted">
                  {rules.outOfNetwork.basis === "mac"
                    ? "The plan bases payments on its maximum allowable charge."
                    : `The allowance is based on the ${rules.outOfNetwork.percentile}th percentile of usual and customary fees.`}{" "}
                  The dentist may bill above that allowance. Confirm
                  participation in any city you expect to live in.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Premiums</dt>
                <dd className="mt-1 text-muted">
                  {formatMoney(rules.premiumMonthly)} a month
                  {rules.premiumPreTax ? ", deducted before tax" : ""}.
                </dd>
              </div>
              {rules.maxRewards && (
                <div>
                  <dt className="font-medium">Unused-benefit rollover</dt>
                  <dd className="mt-1 text-muted">
                    Plan payments of {formatMoney(rules.maxRewards.threshold)}{" "}
                    or less can add{" "}
                    {formatMoney(rules.maxRewards.rolloverAmount)} to next
                    year’s maximum, plus{" "}
                    {formatMoney(rules.maxRewards.inNetworkBonus)} if all care
                    was in network. Deposited on day{" "}
                    {rules.maxRewards.depositDay}, up to an account limit of{" "}
                    {formatMoney(rules.maxRewards.accountLimit)}.
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <h3 className="text-lg font-medium">All frequency limits</h3>
            <ul className="mt-3 space-y-3 text-muted">
              {rules.frequencyLimits.map((f) => (
                <li key={f.id}>{f.label}</li>
              ))}
            </ul>
            {!rules.frequencyLimits.length && (
              <p className="mt-3 text-muted">
                No limits listed. Confirm these in the plan document.
              </p>
            )}
          </div>
          <details>
            <summary>Rule references</summary>
            <p className="mt-3 text-sm text-muted">
              Rules version {rules.version}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {Object.entries(rules.sections).map(([key, section]) => (
                <li key={key}>{section}</li>
              ))}
            </ul>
          </details>
        </div>
      </details>
    </Section>
  );
}
