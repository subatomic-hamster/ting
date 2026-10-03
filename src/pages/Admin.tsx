import { DemoDataPill } from '../components/DemoDataPill';
import { InsightCard, type Insight } from '../components/InsightCard';
import { PageHeader } from '../components/Section';
import admin from '../fixtures/admin.json';

/** Aggregates only. Groups smaller than this are hidden to protect privacy. */
const MIN_GROUP = 20;

export default function Admin() {
  const groups: Insight[] = admin.groups;
  const shown = groups.filter((g) => g.n >= MIN_GROUP);
  const hidden = groups.length - shown.length;

  return (
    <div>
      <PageHeader title="Employer insights" subtitle={`${admin.employer} · aggregate data only, no individual records.`}>
        <DemoDataPill label="Demo aggregates" />
      </PageHeader>
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
