import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, USE_MOCKS } from '../api';
import { authConfig, signIn, useAuth } from '../auth/auth';
import { DemoDataPill } from '../components/DemoDataPill';
import { PageHeader, Section } from '../components/Section';
import { formatMoney } from '../lib/format';

/** Lincoln plan analyst: review compiled plan rules against the document's own words, then approve a hashed version. */
export default function Analyst() {
  const claims = useAuth((s) => s.claims);
  const isAnalyst = USE_MOCKS || !!claims?.groups.includes('lincoln_analyst');
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ['pending-rules'], queryFn: () => api.pendingRules(), enabled: isAnalyst });
  const approve = useMutation({ mutationFn: (id: string) => api.approveSubmittedRules(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-rules'] }) });

  return (
    <div className="space-y-5">
      <PageHeader title="Plan rules review" subtitle="Plan analysts check each compiled rule against the plan document before members' estimates use it.">
        <DemoDataPill label="Demo plans" />
      </PageHeader>
      {!isAnalyst ? (
        <p className="rounded-xl border border-line bg-white p-3 text-sm text-muted">
          Plan analysts only.{' '}
          {authConfig() && (
            <button type="button" className="font-medium text-brand-700 underline" onClick={() => void signIn()}>
              Sign in
            </button>
          )}
        </p>
      ) : !pending.data?.length ? (
        <p className="text-sm text-muted">Nothing waiting. Members submit compiled rules from the Plan rules page.</p>
      ) : (
        pending.data.map((p) => (
          <Section key={p.id} id={`rules-${p.id}`} title={`${p.rules.name}`}>
            <p className="text-sm text-muted">
              From {p.source || 'an uploaded document'} · submitted {new Date(p.submittedAt).toLocaleString()}
            </p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              <li>Annual max: {formatMoney(p.rules.annualMax)}</li>
              <li>Deductible: {formatMoney(p.rules.deductible.amount)}</li>
              <li>
                In network: {Math.round(p.rules.coinsurance.inNetwork.preventive * 100)} / {Math.round(p.rules.coinsurance.inNetwork.basic * 100)} /{' '}
                {Math.round(p.rules.coinsurance.inNetwork.major * 100)}%
              </li>
              <li>Endodontics is {p.rules.categoryClass.endodontics}</li>
            </ul>
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">Evidence ({Object.keys(p.evidence).length} quotes)</summary>
              <ul className="mt-1 space-y-1">
                {Object.entries(p.evidence).map(([field, ev]) => (
                  <li key={field}>
                    <strong className="text-ink">{field}</strong>: &ldquo;{ev?.snippet}&rdquo; {ev?.section && <span>({ev.section})</span>}
                  </li>
                ))}
              </ul>
            </details>
            <button type="button" className="btn-primary mt-3" disabled={approve.isPending} onClick={() => approve.mutate(p.id)}>
              Approve version
            </button>
          </Section>
        ))
      )}
      {approve.data && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          Approved as <strong>{approve.data.rules.version}</strong> (fingerprint <code>{approve.data.hash.slice(0, 16)}…</code>). It&rsquo;s now a plan option for
          members.
        </p>
      )}
    </div>
  );
}
