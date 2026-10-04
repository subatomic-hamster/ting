import { useState } from "react";
import { DentistQuestions, ShareWithDentist } from "../components/DentistQuestions";
import { EstimateFooter } from "../components/EstimateFooter";
import { IntakeBox } from "../components/IntakeBox";
import { ProcedureCatalog } from "../components/ProcedureCatalog";
import { ProcedureList } from "../components/ProcedureList";
import { PricingNote } from "../components/PricingNote";
import { ScheduleTabs } from "../components/ScheduleTabs";
import { PageHeader, Section, DisclosureSection } from "../components/Section";
import { Timeline } from "../components/Timeline";
import { Waterfall } from "../components/Waterfall";
import { PriceEditor } from "../components/PriceEditor";
import { formatMoney, procedureName } from "../lib/format";
import { yearOf } from "../lib/dates";
import { useActive, useAppStore, useProfile } from "../store";
export default function Treatment() {
  const profile = useProfile();
  const active = useActive();
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const [picked, setPicked] = useState<string>();
  const selected =
    profile.procedures.find((p) => p.id === picked) ?? profile.procedures[0];
  const line = selected && active.lines.find((l) => l.id === selected.id);
  const rules = profile.currentPlan;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Your treatment"
        subtitle={`${rules.name}. Estimated care across ${yearOf(profile.asOf)} and ${yearOf(profile.asOf) + 1}.`}
      />
      {selected && (
        <>
          <section className="border-l-2 border-brand-600 pl-5">
            <p className="text-base">Estimated total you pay</p>
            <p className="tabular mt-1 text-[32px] leading-[38px] font-medium">
              {formatMoney(active.expectedOwes)}
            </p>
            <EstimateFooter />
            {active.lines.some((l) => l.pricingWarning) && (
              <p className="mt-3">
                Items with missing allowances budget the full fee.
              </p>
            )}
            <a href="#schedule" className="btn-primary mt-4 w-full sm:w-auto">
              Choose treatment dates
            </a>
          </section>
          <details className="border-t border-line">
            <summary>Dentist network for this plan</summary>
            <p className="mb-3 text-base text-muted">
              This comparison changes all treatment items. Confirm participation
              with your insurer.
            </p>
            <div
              role="radiogroup"
              aria-label="Dentist network"
              className="flex flex-wrap gap-2"
            >
              {(["in", "out"] as const).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={network === n}
                  className={network === n ? "btn-primary" : "btn-secondary"}
                  onClick={() => setNetwork(n)}
                >
                  {n === "in" ? "In-network" : "Out-of-network"}
                </button>
              ))}
            </div>
          </details>
          <div className="grid gap-8 lg:grid-cols-5">
            <Section
              title="Treatment items"
              id="items"
              className="lg:col-span-2"
            >
              <ProcedureList
                selectedId={selected.id}
                onSelect={(id) => {
                  setPicked(id);
                  requestAnimationFrame(() => {
                    document
                      .getElementById("waterfall")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
              />
            </Section>
            <Section
              title={procedureName(selected)}
              id="waterfall"
              className="lg:col-span-3"
            >
              {line && (
                <>
                  <p className="mb-4 text-xs text-muted">
                    Selected item.{" "}
                    {selected.inNetwork ? "In-network" : "Out-of-network"}{" "}
                    dentist.
                  </p>
                  <Waterfall
                    line={line}
                    rules={rules}
                    name={procedureName(selected)}
                  />
                  <PricingNote line={line} />
                  <PriceEditor procedure={selected} />
                </>
              )}
            </Section>
          </div>
          <Section title="Choose dates" id="schedule">
            <ScheduleTabs panelId="timeline-panel" />
            <div
              id="timeline-panel"
              role="tabpanel"
              aria-label="Treatment timeline"
              className="mt-6"
            >
              <Timeline />
            </div>
          </Section>
          <Section title="Questions for your dentist" id="questions">
            <DentistQuestions />
            <div className="mt-6">
              <ShareWithDentist compact />
            </div>
          </Section>
        </>
      )}
      <DisclosureSection
        title="Add a treatment plan"
        id="intake"
        initialOpen={!selected}
      >
        <IntakeBox />
      </DisclosureSection>
      <DisclosureSection
        title="Browse procedures, including braces"
        id="catalog"
      >
        <ProcedureCatalog />
      </DisclosureSection>
    </div>
  );
}
