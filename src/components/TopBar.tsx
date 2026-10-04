import type { Session } from '../api';
import { authConfig, signIn, signOut, useAuth } from '../auth/auth';
import { PERSONAS } from '../data/personas';
import { useAppStore } from '../store';
import { ListIcon, ToothIcon } from './Icons';

export function TopBar({
  session,
  onOpenAudit,
  auditOpen,
}: {
  session?: Session;
  onOpenAudit: () => void;
  auditOpen: boolean;
}) {
  const personaName = useAppStore((s) => PERSONAS[s.personaId].name);
  const allPlans = useAppStore((s) => s.plans);
  const plan = useAppStore((s) => s.profile.currentPlan);
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  // The plan you're on this year; waiving and membership plans are options for next year, not coverage now.
  const plans = allPlans.filter((p) => p.kind === 'insurance');
  const claims = useAuth((s) => s.claims);
  const canSignIn = !!authConfig();
  const role = claims?.groups.includes('employer_admin') ? 'Benefits admin' : claims?.groups.includes('lincoln_analyst') ? 'Lincoln analyst' : 'Member';

  return (
    <header className="no-print bg-brand-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500" aria-hidden>
            <ToothIcon width={18} height={18} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="font-semibold tracking-tight">Ting</div>
            <div className="truncate text-xs text-brand-100" aria-live="polite">
              {session ? `${session.name} · ${session.employer}` : `Loading ${personaName}…`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-brand-100">
            <span className="hidden sm:inline">Plan</span>
            <select
              aria-label="Dental plan"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white [&>option]:text-ink"
              value={plan.id}
              onChange={(e) => setCurrentPlan(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div role="radiogroup" aria-label="Dentist network" className="flex rounded-lg bg-white/10 p-0.5 text-sm">
            {(['in', 'out'] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={network === n}
                onClick={() => setNetwork(n)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  network === n ? 'bg-white text-brand-900' : 'text-brand-100 hover:text-white'
                }`}
              >
                {n === 'in' ? 'In-network' : 'Out'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenAudit}
            aria-expanded={auditOpen}
            aria-controls="audit-drawer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1.5 text-sm font-medium hover:bg-white/10"
          >
            <ListIcon /> <span>Audit trail</span>
          </button>

          {canSignIn &&
            (claims ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-white/20 px-2.5 py-1.5 text-sm font-medium hover:bg-white/10"
                title={claims.email}
              >
                {role} · Sign out
              </button>
            ) : (
              <button type="button" onClick={() => void signIn()} className="rounded-lg bg-white px-2.5 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-50">
                Sign in with Acme
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}
