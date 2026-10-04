import type { Session } from '../api';
import { authConfig, signIn, signOut, useAuth } from '../auth/auth';
import { PERSONAS } from '../data/personas';
import { useLanguage } from '../lib/language';
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
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const claims = useAuth((s) => s.claims);
  const language = useLanguage((s) => s.language);
  const setLanguage = useLanguage((s) => s.setLanguage);
  const canSignIn = !!authConfig();
  const role = claims?.groups.includes('employer_admin') ? 'Benefits admin' : claims?.groups.includes('lincoln_analyst') ? 'Plan analyst' : 'Member';

  return (
    <header className="no-print bg-brand-600 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15" aria-hidden>
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

          <div role="radiogroup" aria-label="Explanation language" className="flex rounded-lg bg-white/10 p-0.5 text-sm">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                onClick={() => setLanguage(l)}
                title={l === 'es' ? 'Explicaciones en español (los importes no cambian)' : 'Explanations in English'}
                className={`rounded-md px-1.5 py-1 text-xs font-medium uppercase ${language === l ? 'bg-white text-brand-900' : 'text-brand-100 hover:text-white'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenAudit}
            aria-expanded={auditOpen}
            aria-controls="audit-drawer"
            aria-label="Audit trail"
            title="Audit trail: every engine and API call"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"
          >
            <ListIcon />
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
