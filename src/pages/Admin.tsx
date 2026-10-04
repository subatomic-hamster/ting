import { useQuery } from '@tanstack/react-query';
import { api, USE_MOCKS } from '../api';
import { authConfig, signIn, useAuth } from '../auth/auth';
import { DemoDataPill } from '../components/DemoDataPill';
import { InsightCard } from '../components/InsightCard';
import { PageHeader } from '../components/Section';
import admin from '../fixtures/admin.json';

/** Aggregates only. Groups smaller than this are hidden to protect privacy (the AWS backend enforces it too). */
const MIN_GROUP = 20;
const local = () => {
  const shown = admin.groups.filter((g) => g.n >= MIN_GROUP);
  return { employer: admin.employer, groups: shown, hidden: admin.groups.length - shown.length, isDemoData: true };
};

export default function Admin() {
  const claims = useAuth((s) => s.claims);
  const isAdmin = !!claims?.groups.includes('employer_admin');
  // Live: the server checks the employer_admin role. Public demo: the same aggregates from the bundled sample.
  const live = useQuery({ queryKey: ['admin', claims?.sub], queryFn: () => api.getAdminInsights(), enabled: !USE_MOCKS && isAdmin });
  const data = live.data ?? local();
  const { groups: shown, hidden } = data;
  const needsSignIn = !USE_MOCKS && !!authConfig() && !isAdmin;

  return (
    <div>
      <PageHeader title="Employer insights" subtitle={`${data.employer} · aggregate data only, no individual records.`}>
        <DemoDataPill label="Demo aggregates" />
      </PageHeader>
      {needsSignIn && (
        <p className="mb-4 rounded-xl border border-line bg-white p-3 text-sm text-muted">
          Showing the public sample.{' '}
          <button type="button" className="font-medium text-brand-700 underline" onClick={() => void signIn()}>
            Sign in as an Acme benefits admin
          </button>{' '}
          to load your company&rsquo;s aggregates from the server.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((g) => (
          <InsightCard key={g.id} insight={g} />
        ))}
      </div>
      {hidden > 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          {hidden} group{hidden > 1 ? 's' : ''} hidden: fewer than {MIN_GROUP} members, so results could identify individuals.
        </p>
      )}
    </div>
  );
}
