import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, USE_MOCKS } from "../api";
import { DemoDataPill } from "../components/DemoDataPill";
import { PageHeader, Section } from "../components/Section";
import { cdtLabel } from "../engine/cdt";
import { formatDate, formatMoney } from "../lib/format";
import { useAppStore } from "../store";

const CARC: Record<string, string> = {
  "45": "above the contracted fee",
  "1": "deductible",
  "2": "coinsurance",
};

/**
 * The insurer's system of record for the member (enrollment, plan, accumulators, claims with 835-style adjustments), the
 * data Ting syncs from. Demo buttons stand in for the outside world: a dentist visit, a mid-year plan change.
 */
export default function CarrierRecord() {
  const personaId = useAppStore((s) => s.personaId);
  const qc = useQueryClient();
  // Offline, the record is derived from the member's ledger in the browser, so it refetches when the ledger changes.
  const ledger = useAppStore((s) => s.profile.ledger);
  const plan = useAppStore((s) => s.profile.currentPlan.id);
  const rec = useQuery({
    queryKey: USE_MOCKS ? ["carrier", personaId, ledger, plan] : ["carrier", personaId],
    queryFn: () => api.getCarrierRecord(),
    refetchInterval: USE_MOCKS ? false : 5000,
  });
  const visit = useMutation({
    mutationFn: () => api.fireMockClaim(useAppStore.getState().profile),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carrier"] }),
  });
  const change = useMutation({
    mutationFn: () =>
      api.changePlan(
        rec.data?.member?.planId === "acme-high" ? "acme-low" : "acme-high",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carrier"] }),
  });
  const r = rec.data;
  const accum = r?.accumulators[r.accumulators.length - 1];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insurer record"
        subtitle="What your insurer's systems hold for you: enrollment, plan, accumulators and claims. Ting syncs from it automatically."
      >
        <DemoDataPill label="Demo carrier data" />
      </PageHeader>
      {!r?.member ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <Section
            title="Demo: things that happen outside Ting"
            id="demo"
            actions={
              <span className="text-xs text-muted">
                Watch the dashboard update by itself
              </span>
            }
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={visit.isPending}
                onClick={() => visit.mutate()}
              >
                {visit.isPending ? "Recording…" : "A dentist visit happens"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={change.isPending}
                onClick={() => change.mutate()}
              >
                {change.isPending
                  ? "Changing…"
                  : `Employer changes plan to ${r.member.planId === "acme-high" ? "Low" : "High"}`}
              </button>
            </div>
            {visit.data === undefined && visit.isError && (
              <p className="mt-2 text-xs text-warn">{visit.error.message}</p>
            )}
          </Section>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Enrollment (834)" id="enrollment">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {[
                  ["Member ID", r.member.memberId],
                  ["Group", `${r.member.groupNumber} · ${r.member.employer}`],
                  ["Plan", r.plan?.name ?? r.member.planId],
                  ["Coverage", r.member.coverageTier],
                  [
                    "Effective",
                    formatDate(r.member.effectiveDate, { year: true }),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
            <Section
              title={`Accumulators ${accum?.planYear ?? ""}`}
              id="accumulators"
            >
              {accum && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Annual max used</dt>
                  <dd>
                    {formatMoney(accum.annualMaxUsed)}
                    {r.plan && ` of ${formatMoney(r.plan.annualMax)}`}
                  </dd>
                  <dt className="text-muted">Deductible met</dt>
                  <dd>{formatMoney(accum.deductibleMet)}</dd>
                  <dt className="text-muted">Ortho used</dt>
                  <dd>{formatMoney(accum.orthoUsed)}</dd>
                </dl>
              )}
            </Section>
          </div>
          <Section title="Claims (837D / 835)" id="claims">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5">Claim</th>
                    <th>Service</th>
                    <th>Line</th>
                    <th className="text-right">Billed</th>
                    <th className="text-right">Allowed</th>
                    <th className="text-right">Plan paid</th>
                    <th className="text-right">You owe</th>
                    <th className="pl-4">Adjustments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...r.claims].reverse().flatMap((c) =>
                    c.lines.map((l) => (
                      <tr
                        key={`${c.claimId}-${l.lineNo}`}
                        className={c.origin === "visit" ? "bg-amber-50" : ""}
                      >
                        <td className="py-1.5 font-mono text-xs">
                          {c.claimId}
                          <span className="block text-xs text-muted">
                            {c.status}
                          </span>
                        </td>
                        <td>{formatDate(c.serviceDate)}</td>
                        <td>{cdtLabel(l.cdt, l.tooth)}</td>
                        <td className="text-right">{formatMoney(l.billed)}</td>
                        <td className="text-right">{formatMoney(l.allowed)}</td>
                        <td className="text-right">
                          {formatMoney(l.planPaid)}
                        </td>
                        <td className="text-right">
                          {formatMoney(l.memberOwes)}
                        </td>
                        <td className="pl-4 text-xs text-muted">
                          {l.adjustments
                            .map(
                              (a) =>
                                `${a.group}-${a.carc} ${CARC[a.carc] ?? ""} ${formatMoney(a.amount)}`,
                            )
                            .join("; ")}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
