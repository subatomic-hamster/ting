import { useState } from 'react';
import { DemoDataPill } from '../components/DemoDataPill';
import { DentistQuestions, ShareWithDentist } from '../components/DentistQuestions';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { IntakeBox } from '../components/IntakeBox';
import { ProcedureList } from '../components/ProcedureList';
import { SamplePlanNote } from '../components/SamplePlanNote';
import { ScheduleTabs } from '../components/ScheduleTabs';
import { PageHeader, Section } from '../components/Section';
import { Timeline } from '../components/Timeline';
import { Waterfall } from '../components/Waterfall';
import { FEE_ZIP } from '../hooks/useDentistQuotes';
import { procedureName } from '../lib/format';
import { useActive, useAppStore, useProfile } from '../store';

export default function Treatment() {
  const profile = useProfile();
  const network = useAppStore((s) => s.network);
  const active = useActive();
  const [picked, setPicked] = useState<string>();
  const selected = profile.procedures.find((p) => p.id === picked) ?? profile.procedures[0];
  const line = selected && active.lines.find((l) => l.id === selected.id);
  // A line is priced under the plan of its year; next year it's the same plan unless you switch at enrollment.
  const rules = profile.currentPlan;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Your treatment"
        subtitle={
          <>
            What you'll owe, step by step, and the cheapest time to do it. {rules.name} · {network === 'in' ? 'in-network' : 'out-of-network'} dentist.
          </>
        }
      >
        <SamplePlanNote />
      </PageHeader>

      <Section title="1. What did your dentist recommend?" id="intake">
        <IntakeBox />
      </Section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Section className="lg:col-span-2" title="2. Your items" id="items" actions={<DemoDataPill label={`Demo fees · ZIP ${FEE_ZIP}`} />}>
          <ProcedureList selectedId={selected?.id} onSelect={setPicked} />
        </Section>

        <Section
          className="lg:col-span-3"
          title={selected ? `3. What you'll pay: ${procedureName(selected)}` : "3. What you'll pay"}
          id="waterfall"
          eyebrow={<>From the engine · rules {line?.rulesVersion ?? rules.version}</>}
        >
          {selected && line ? (
            <>
              <Waterfall line={line} rules={rules} name={procedureName(selected)} />
              {!selected.inNetwork && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Out of network: watch for <GlossaryTerm term="balance billing" /> above the plan's{' '}
                  <GlossaryTerm term="usual and customary">allowed amount</GlossaryTerm>.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Add an item to see the cost breakdown.</p>
          )}
        </Section>
      </div>

      <Section title="4. When to do it" id="schedule">
        <ScheduleTabs panelId="timeline-panel" />
        <div id="timeline-panel" role="tabpanel" aria-label="Treatment timeline" className="mt-4">
          <Timeline />
        </div>
      </Section>

      <Section title="5. Questions for your dentist" id="questions" actions={<ShareWithDentist />}>
        <DentistQuestions />
      </Section>
    </div>
  );
}
