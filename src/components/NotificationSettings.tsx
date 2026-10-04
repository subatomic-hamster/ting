import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type NotificationPrefs } from '../api';
import { useAppStore } from '../store';
import { DemoDataPill } from './DemoDataPill';
import { Section } from './Section';

const CADENCES: { value: NotificationPrefs['cadence']; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly (first Monday)' },
  { value: 'off', label: 'Off' },
];

/** F6: digest cadence and how much detail emails may carry. Private by default. */
export function NotificationSettings() {
  const personaId = useAppStore((s) => s.personaId);
  const asOf = useAppStore((s) => s.profile.asOf);
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ['prefs', personaId], queryFn: () => api.getPreferences() });
  const digest = useQuery({ queryKey: ['digest', personaId, asOf], queryFn: () => api.getDigest() });
  const save = useMutation({ mutationFn: (p: NotificationPrefs) => api.savePreferences(p), onSuccess: (p) => qc.setQueryData(['prefs', personaId], p) });
  const test = useMutation({ mutationFn: () => api.sendTestDigest() });
  const current = prefs.data ?? { cadence: 'monthly', detail: 'private' };

  return (
    <Section id="notifications" title="Digest and notifications" actions={<DemoDataPill label="Demo" />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="font-medium">Digest</span>
            <select
              className="mt-1 block w-full rounded-lg border border-line px-2 py-1.5"
              value={current.cadence}
              onChange={(e) => save.mutate({ ...current, cadence: e.target.value as NotificationPrefs['cadence'] })}
            >
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={current.detail === 'detailed'}
              onChange={(e) => save.mutate({ ...current, detail: e.target.checked ? 'detailed' : 'private' })}
            />
            <span>
              Put amounts and procedures in emails
              <span className="block text-xs text-muted">
                Off by default: emails only say you have an update. Anyone who can read your email would see your dental details.
              </span>
            </span>
          </label>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? 'Sending…' : 'Send a test digest now'}
          </button>
          {test.data && (
            <p className="text-xs text-muted">
              Sent{test.data.pushedTo ? ` to ${test.data.pushedTo} open screen${test.data.pushedTo === 1 ? '' : 's'}` : ''}
              {test.data.emailed ? ' and by email' : ' (email isn’t set up in this demo)'}
              {test.data.private ? ', without any details.' : ', with details.'}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Inside the app this month</p>
          {digest.data ? (
            <>
              <p className="mt-1 font-medium">{digest.data.title}</p>
              <p className="mt-1 whitespace-pre-line text-ink/80">{digest.data.body}</p>
            </>
          ) : (
            <p className="mt-2 h-10 animate-pulse rounded bg-slate-100" aria-hidden />
          )}
        </div>
      </div>
    </Section>
  );
}
