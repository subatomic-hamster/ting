import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, type CompiledPlan } from "../api";
import {
  applyAnswers,
  approveRules,
  finalizeRules,
  type Answer,
  type AnswerPath,
} from "../compiler/compile";
import { PlanPicker } from "../components/PlanPicker";
import { PageHeader, Section } from "../components/Section";
import type { PlanRules as Rules, ServiceClass } from "../engine/types";
import { parseInsuranceCard, plansForGroup } from "../intake/insuranceCard";
import { formatMoney, formatPercent } from "../lib/format";
import { useAppStore } from "../store";

const CLASSES: ServiceClass[] = ["preventive", "basic", "major", "ortho"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const field =
  "mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm";

/** F2 plan compiler: a benefits summary becomes rules the member confirms; every estimate names the approved version. */
export default function PlanRules() {
  const currentPlan = useAppStore((s) => s.profile.currentPlan);
  const plans = useAppStore((s) => s.plans);
  const addPlan = useAppStore((s) => s.addPlan);
  const [result, setResult] = useState<CompiledPlan>();
  const [answers, setAnswers] = useState<Partial<Record<AnswerPath, Answer>>>(
    {},
  );
  const [status, setStatus] = useState("");
  const [approved, setApproved] = useState<{ rules: Rules; hash: string }>();

  const compile = useMutation({
    mutationFn: async (file: File) =>
      api.compilePlan((await api.readDocument(file)).text),
    onMutate: (file) => setStatus(`Reading ${file.name}…`),
    onSuccess: (r, file) => {
      setResult(r);
      setAnswers({});
      setApproved(undefined);
      const filled = "";
      const guarded = r.triage?.quarantined
        ? " This document includes unrelated instructions. Review the extracted coverage against the original."
        : "";
      setStatus(
        (r.questions.length
          ? `Read ${file.name}. The document doesn't say ${r.questions.length === 1 ? "one thing" : `${r.questions.length} things`}, and Ting won't guess.`
          : `Read ${file.name}. Every rule was found in the document.`) +
          filled +
          guarded,
      );
    },
    onError: (err, file) =>
      setStatus(
        `Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}.`,
      ),
  });

  const card = useMutation({
    mutationFn: async (file: File) =>
      parseInsuranceCard((await api.readDocument(file)).text),
    onMutate: (file) => setStatus(`Reading ${file.name}…`),
    onSuccess: (info) => {
      const ids = info.groupNumber ? plansForGroup(info.groupNumber) : [];
      const names = plans.filter((p) => ids.includes(p.id)).map((p) => p.name);
      setStatus(
        info.groupNumber
          ? `${info.carrier ?? "Card"} group ${info.groupNumber}${info.memberId ? `, member ${info.memberId}` : ""}: ${
              names.length
                ? `your employer offers ${names.join(" and ")}.`
                : "no plans on file for that group yet. Upload the benefits summary instead."
            }`
          : "No group number found on the card. Try a sharper photo of the front.",
      );
    },
    onError: (err, file) =>
      setStatus(
        `Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}.`,
      ),
  });

  const draft = result ? applyAnswers(result.draft, answers) : undefined;
  const final = draft ? finalizeRules(draft) : undefined;

  const approve = async () => {
    if (final?.ok) setApproved(await approveRules(final.rules));
  };

  const submit = useMutation({
    mutationFn: () =>
      final?.ok && result
        ? api.submitRules(
            final.rules,
            result.evidence,
            status.replace(/^Read /, "").split(".")[0],
          )
        : Promise.reject(new Error("Not final")),
  });

  const use = (asCurrent: boolean) => {
    if (!approved) return;
    addPlan(approved.rules, asCurrent);
    setStatus(
      `Using ${approved.rules.name} ${asCurrent ? "as your current plan" : "as an enrollment option"}.`,
    );
  };

  const upload = (
    label: string,
    accept: string,
    onFile: (f: File) => void,
    primary = false,
  ) => (
    <label
      className={`${primary ? "btn-primary" : "btn-secondary"} cursor-pointer`}
    >
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plan rules"
        subtitle="The rules every estimate uses, read from your plan's own documents."
      >
        <label className="flex min-w-0 flex-col items-start gap-2 text-sm text-muted">
          Your plan this year <PlanPicker />
        </label>
      </PageHeader>

      <RulesView rules={currentPlan} title="Your plan's rules" />

      <Section title="Load a plan document" id="load">
        <p className="text-sm text-muted">
          Upload your benefits summary, review the coverage and fill in anything
          missing before using it for an estimate.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {upload(
            "Upload benefits summary",
            "application/pdf,.txt,image/*",
            (f) => compile.mutate(f),
            true,
          )}
          {upload("Scan insurance card", "image/*,.txt", (f) => card.mutate(f))}
          <a
            className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
            href="/samples/acme-benefits-summary.pdf"
            download
          >
            Sample benefits summary (PDF)
          </a>
        </div>
        <p className="mt-2 min-h-5 text-sm text-muted" role="status">
          {status}
        </p>

        {result && (
          <div className="mt-2 space-y-3">
            {submit.isError && (
              <p role="alert">
                Could not send for plan review. Please try again.
              </p>
            )}
            {result.questions.map((q) => (
              <div
                key={q.field}
                className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
              >
                <label htmlFor={`q-${q.field}`} className="text-sm font-medium">
                  {q.prompt}
                </label>
                {q.kind === "choice" || q.kind === "boolean" ? (
                  <select
                    id={`q-${q.field}`}
                    className={field}
                    value={
                      answers[q.field] === undefined
                        ? ""
                        : String(answers[q.field])
                    }
                    onChange={(e) =>
                      setAnswers((a) => ({
                        ...a,
                        [q.field]:
                          q.kind === "boolean"
                            ? e.target.value === "true"
                            : e.target.value,
                      }))
                    }
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {(q.kind === "boolean"
                      ? [
                          { value: "true", label: "Yes" },
                          { value: "false", label: "No" },
                        ]
                      : (q.options ?? [])
                    ).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`q-${q.field}`}
                    className={field}
                    type={q.kind === "text" ? "text" : "number"}
                    value={String(answers[q.field] ?? "")}
                    placeholder={q.kind === "percent" ? "e.g. 80" : undefined}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.field]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            {final && !final.ok && final.errors.length > 0 && (
              <div className="rounded-xl border border-cost/30 bg-cost/10 p-3 text-sm text-cost">
                {final.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            {result.secondReader && result.secondReader.length > 0 && (
              <div
                className={`rounded-xl border p-3 text-sm ${result.secondReader.some((c) => c.review) ? "border-amber-200 bg-amber-50" : "border-save/30 bg-save/10"}`}
              >
                {result.secondReader.some((c) => c.review) ? (
                  <>
                    <p className="font-medium">
                      A second reading wasn&rsquo;t sure the document says:
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {result.secondReader
                        .filter((c) => c.review)
                        .map((c) => (
                          <li key={c.field}>{c.statement}</li>
                        ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">
                      Check these against the document before approving.
                    </p>
                  </>
                ) : (
                  <p>
                    Review the extracted coverage against your original plan
                    document.
                  </p>
                )}
              </div>
            )}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                Where each rule came from
              </summary>
              <ul className="mt-1 space-y-1">
                {Object.entries(result.evidence).map(([f, ev]) => (
                  <li key={f}>
                    <strong className="text-ink">{f}</strong>: "{ev?.snippet}"{" "}
                    {ev?.section && <span>({ev.section})</span>}
                  </li>
                ))}
              </ul>
            </details>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!final?.ok}
                onClick={() => void approve()}
              >
                Confirm extracted coverage
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!final?.ok || submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isSuccess
                  ? "Sent for plan review"
                  : "Send for plan review"}
              </button>
              {final && !final.ok && (
                <span className="text-xs text-muted">
                  {final.missing.length} answer(s) still needed.
                </span>
              )}
            </div>
            {approved && (
              <div className="space-y-2 rounded-xl border border-save/30 bg-save/10 p-3 text-sm">
                <p>Coverage confirmed for this estimate.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => use(true)}
                  >
                    Use as my current plan
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => use(false)}
                  >
                    Add as an enrollment option
                  </button>
                </div>
              </div>
            )}
            {final?.ok && (
              <RulesView
                rules={final.rules}
                title="Rules read from the document"
              />
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function RulesView({ rules, title }: { rules: Rules; title: string }) {
  const s = rules.sections;
  if (rules.kind !== "insurance")
    return (
      <Section title={title}>
        <p className="text-sm">{rules.name}</p>
      </Section>
    );
  return (
    <Section title={title} eyebrow={<>Rules version {rules.version}</>}>
      <p className="text-sm text-muted">{rules.name}</p>
      <dl className="mt-4 divide-y divide-line">
        {CLASSES.map((c) => (
          <div key={c} className="py-4">
            <dt className="font-medium">
              {c === "ortho" ? "Orthodontics" : cap(c)}: plan pays
            </dt>
            <dd className="mt-2 flex flex-wrap justify-between gap-3">
              <span>
                In-network {formatPercent(rules.coinsurance.inNetwork[c])}
              </span>
              <span>
                Out-of-network{" "}
                {formatPercent(rules.coinsurance.outOfNetwork[c])}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4">
        Orthodontic lifetime maximum: {formatMoney(rules.orthoLifetimeMax)}.
        Confirm age eligibility and any installment rules in your plan document.
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
        <li>
          Annual max {formatMoney(rules.annualMax)}; deductible{" "}
          {formatMoney(rules.deductible.amount)} on{" "}
          {rules.deductible.appliesTo.join(" and ")} care.{" "}
          <cite className="text-xs not-italic text-muted">{s.annualMax}</cite>
        </li>
        <li>
          Premium {formatMoney(rules.premiumMonthly)} a month
          {rules.premiumPreTax ? ", pre-tax" : ""}.
        </li>
        <li>
          Out of network:{" "}
          {rules.outOfNetwork.basis === "mac"
            ? "maximum allowable charge"
            : `${rules.outOfNetwork.percentile}th percentile of usual and customary fees`}
          .{" "}
          <cite className="text-xs not-italic text-muted">
            {s.outOfNetwork}
          </cite>
        </li>
        {rules.maxRewards && (
          <li>
            Max Rollover: plan payments of{" "}
            {formatMoney(rules.maxRewards.threshold)} or less in a year add{" "}
            {formatMoney(rules.maxRewards.rolloverAmount)} (+
            {formatMoney(rules.maxRewards.inNetworkBonus)} if all in network) to
            next year's max, deposited on day {rules.maxRewards.depositDay}, up
            to {formatMoney(rules.maxRewards.accountLimit)}.{" "}
            <cite className="text-xs not-italic text-muted">
              {s.maxRewards}
            </cite>
          </li>
        )}
        {!rules.preventiveCountsTowardMax && (
          <li>
            Preventive care doesn't count against the annual max.{" "}
            <cite className="text-xs not-italic text-muted">
              {s.preventiveMax}
            </cite>
          </li>
        )}
        {rules.alternateBenefit && (
          <li>
            Back-tooth tooth-colored fillings are paid at the silver-filling
            rate.{" "}
            <cite className="text-xs not-italic text-muted">
              {s.alternateBenefit}
            </cite>
          </li>
        )}
        {rules.q4DeductibleCarryover && (
          <li>
            Deductible paid in October to December also counts toward next year.{" "}
            <cite className="text-xs not-italic text-muted">
              {s.q4Carryover}
            </cite>
          </li>
        )}
        {rules.frequencyLimits.map((f) => (
          <li key={f.id}>{f.label}</li>
        ))}
      </ul>
    </Section>
  );
}
