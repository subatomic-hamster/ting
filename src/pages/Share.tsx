import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DemoDataPill } from '../components/DemoDataPill';
import { EstimateFooter } from '../components/EstimateFooter';
import { HandoffSheet } from '../components/HandoffSheet';
import { isPersonaId, PERSONAS, type PersonaId } from '../data/personas';
import { optimize } from '../engine/schedule';
import { todayISO } from '../lib/dates';
import { HORIZON, selectActive, useAppStore, type ActiveSchedule } from '../store';

const PRESETS = ['cheapest', 'fastest', 'balanced'] as const;
const isPreset = (k?: string): k is (typeof PRESETS)[number] => PRESETS.some((p) => p === k);

/**
 * Public dentist handoff page (no app chrome, printable).
 * Mock tokens look like "<persona>.<scheduleKind>.<random>". With the AWS backend this page
 * fetches the shared schedule by token instead.
 */
export default function Share() {
  const { token = '' } = useParams();
  const [personaPart = '', kind] = token.split('.');
  const personaId: PersonaId = isPersonaId(personaPart) ? personaPart : 'dale';
  const storePersona = useAppStore((s) => s.personaId);
  const storeProfile = useAppStore((s) => s.profile);
  const storeActive = useAppStore(selectActive);

  const { profile, schedule } = useMemo((): { profile: typeof storeProfile; schedule: ActiveSchedule } => {
    // Same browser as the member? Use their live plan. Otherwise rebuild it from the demo persona.
    if (storePersona === personaId) return { profile: storeProfile, schedule: storeActive };
    const p = PERSONAS[personaId].profile(todayISO());
    const k = isPreset(kind) ? kind : 'cheapest';
    return { profile: p, schedule: { ...optimize(p, { horizon: HORIZON })[k], kind: k } };
  }, [storePersona, personaId, storeProfile, storeActive, kind]);

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-3 flex max-w-3xl justify-end">
        <DemoDataPill label="Demo handoff" />
      </div>
      <HandoffSheet patientName={PERSONAS[personaId].name} procedures={profile.procedures} schedule={schedule} rulesVersion={profile.currentPlan.version} />
      <EstimateFooter />
    </div>
  );
}
