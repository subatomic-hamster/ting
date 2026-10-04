import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from './auth';

export const CONSENT_VERSION = '2026-10';

/** First sign-in: what Ting reads, what it never shares with the employer, and how to delete everything. */
export function ConsentDialog() {
  const claims = useAuth((s) => s.claims);
  const consent = useQuery({ queryKey: ['consent', claims?.sub], queryFn: () => api.getConsent(), enabled: !!claims });
  const accept = useMutation({ mutationFn: () => api.giveConsent(CONSENT_VERSION), onSuccess: () => consent.refetch() });
  const remove = useMutation({ mutationFn: () => api.deleteMyData() });

  if (!claims || !consent.data || consent.data.version === CONSENT_VERSION) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <h2 id="consent-title" className="text-lg font-semibold">Before you start</h2>
        <p className="mt-1 text-sm text-muted">You signed in with your company account. Your dental information stays with Lincoln, your carrier.</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">What Ting reads</dt>
            <dd className="text-muted">Your Lincoln plan, your claims, and anything you type, say or upload. Nothing from your inbox.</dd>
          </div>
          <div>
            <dt className="font-semibold">What your employer sees</dt>
            <dd className="text-muted">Only de-identified totals for groups of 20 or more. Never your procedures, claims or answers.</dd>
          </div>
          <div>
            <dt className="font-semibold">Deleting everything</dt>
            <dd className="text-muted">Any time, from here or your settings. It removes your claims feed, reminders and this consent.</dd>
          </div>
        </dl>
        {remove.isSuccess && <p className="mt-3 text-sm text-save">Your Ting data was deleted.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? 'Saving…' : 'I agree'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Delete my Ting data
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">Educational estimates, not insurance or tax advice.</p>
      </div>
    </div>
  );
}
