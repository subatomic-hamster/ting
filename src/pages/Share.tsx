import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DemoDataPill } from '../components/DemoDataPill';
import { EstimateFooter } from '../components/EstimateFooter';
import { HandoffSheet } from '../components/HandoffSheet';
import { HomeCareSummary } from '../components/habits/HomeCareSummary';
import { dentistSummary } from '../habits/analytics';
import { SMILESTREAK } from '../habits/program';
import { useHabitStore } from '../habits/store';
import { runEngine } from '../engine';
import { buildEngineInput, PERSONAS, type PersonaId } from '../fixtures/personas';
import { todayISO } from '../lib/dates';
import { selectInput, useAppStore } from '../store';

/**
 * Public dentist handoff page (no app chrome, printable).
 * Mock tokens look like "<persona>.<scheduleKind>.<random>". In real mode this
 * page should fetch the shared plan from the API by token instead.
 */
export default function Share() {
  const { token = '' } = useParams();
  const [personaPart, kind] = token.split('.');
  const personaId: PersonaId = personaPart in PERSONAS ? (personaPart as PersonaId) : 'dale';
  const storePersona = useAppStore((s) => s.personaId);
  const storeInput = useAppStore(selectInput);
  const habits = useHabitStore((s) => (s.personaId === personaId && s.consent.shareWithDentist ? s.sessions : null));
  const asOf = useAppStore((s) => s.asOf);
  const homeCare = useMemo(() => (habits ? dentistSummary(habits, asOf, SMILESTREAK) : null), [habits, asOf]);

  const { input, result } = useMemo(() => {
    // Same browser as the member? Use their live plan. Otherwise rebuild it from the fixtures.
    const i = storePersona === personaId ? storeInput : buildEngineInput(PERSONAS[personaId], todayISO());
    return { input: i, result: runEngine(i) };
  }, [storePersona, personaId, storeInput]);

  const option = result.schedules.find((s) => s.kind === kind) ?? result.activeSchedule;

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-3 flex max-w-3xl justify-end">
        <DemoDataPill label="Demo handoff" />
      </div>
      <HandoffSheet patientName={PERSONAS[personaId].name} procedures={input.procedures} option={option} rulesVersion={result.rulesVersion} />
      <section className="card mx-auto mt-4 max-w-3xl" aria-labelledby="homecare-title">
        <h2 id="homecare-title" className="text-lg font-semibold">Home-care summary</h2>
        {homeCare ? (
          <HomeCareSummary summary={homeCare} patientName={PERSONAS[personaId].name} />
        ) : (
          <p className="mt-1 text-sm text-muted">The patient hasn’t shared smart-brush data. You can confirm good home care at the visit instead.</p>
        )}
      </section>
      <EstimateFooter />
    </div>
  );
}
