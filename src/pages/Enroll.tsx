import { ComparisonTable } from '../components/ComparisonTable';
import { EnrollmentCard } from '../components/EnrollmentCard';
import { FsaCard } from '../components/FsaCard';
import { MaybeSlider } from '../components/MaybeSlider';
import { SamplePlanNote } from '../components/SamplePlanNote';
import { PageHeader, Section } from '../components/Section';
import { procedureFromCdt } from '../fixtures/feeSchedule';
import { yearOf } from '../lib/dates';
import { useAppStore } from '../store';

export default function Enroll() {
  const procedures = useAppStore((s) => s.procedures);
  const asOf = useAppStore((s) => s.asOf);
  const addProcedures = useAppStore((s) => s.addProcedures);
  const maybes = procedures.filter((p) => p.likelihood !== undefined);

  return (
    <div className="space-y-5">
      <PageHeader title={`Open enrollment for ${yearOf(asOf) + 1}`} subtitle="Which plan costs you least once premiums and likely dental work are counted.">
        <SamplePlanNote />
      </PageHeader>

      <EnrollmentCard />

      <Section title="Compare plans" id="compare">
        <ComparisonTable />
      </Section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Section className="lg:col-span-3" title={'"Maybe" work'} id="maybes">
          {maybes.length ? (
            <div className="space-y-6">
              {maybes.map((m) => (
                <MaybeSlider key={m.id} item={m} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">
              <p>Nothing uncertain yet. Things your dentist says you <em>might</em> need go here, weighted by how likely they are.</p>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={() =>
                  addProcedures([
                    procedureFromCdt('D2740', { id: `p-maybe-${Date.now()}`, label: 'Another crown', likelihood: 0.3, source: 'typed', confidence: 1 }),
                  ])
                }
              >
                Add a "maybe" crown (30%)
              </button>
            </div>
          )}
        </Section>
        <Section className="lg:col-span-2" title="FSA" id="fsa">
          <FsaCard />
        </Section>
      </div>
    </div>
  );
}
