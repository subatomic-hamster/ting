import { ComparisonTable } from "../components/ComparisonTable";
import { DemoDataPill } from "../components/DemoDataPill";
import { EnrollmentCard } from "../components/EnrollmentCard";
import { FsaCard } from "../components/FsaCard";
import { MaybeSlider } from "../components/MaybeSlider";
import { NetworkChoice } from "../components/NetworkChoice";
import { YearEndReview } from "../components/YearEndReview";
import { SamplePlanNote } from "../components/SamplePlanNote";
import { PageHeader, Section } from "../components/Section";
import { yearOf } from "../lib/dates";
import { useAppStore, useProfile } from "../store";

export default function Enroll() {
  const profile = useProfile();
  const addProcedures = useAppStore((s) => s.addProcedures);
  const maybes = profile.procedures.filter(
    (p) => p.likelihood !== undefined && p.likelihood < 1,
  );
  const crown = profile.fees.D2740;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Open enrollment for ${yearOf(profile.asOf) + 1}`}
        subtitle="Which option costs you least once premiums, taxes and likely dental work are counted."
      >
        <SamplePlanNote />
      </PageHeader>

      <EnrollmentCard />

      <Section
        title="Compare options"
        id="compare"
        actions={<DemoDataPill label="Demo fees" />}
      >
        <ComparisonTable />
      </Section>

      <Section title="In network or out of network" id="network">
        <NetworkChoice />
      </Section>

      <YearEndReview />

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
              <p>
                Nothing uncertain yet. Things your dentist says you{" "}
                <em>might</em> need go here, weighted by how likely they are.
              </p>
              {crown && (
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  onClick={() =>
                    addProcedures([
                      {
                        id: "maybe-crown",
                        cdt: "D2740",
                        tooth: 3,
                        fee: crown.billed,
                        allowedFee: crown.inNetwork,
                        inNetwork: true,
                        likelihood: 0.3,
                      },
                    ])
                  }
                >
                  Try a sample "maybe" crown (30%)
                </button>
              )}
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
