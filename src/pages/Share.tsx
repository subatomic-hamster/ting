import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api';
import { useParams } from 'react-router-dom';
import { DemoDataPill } from '../components/DemoDataPill';
import { EstimateFooter } from '../components/EstimateFooter';
import { HandoffSheet } from '../components/HandoffSheet';
import { isPersonaId, PERSONAS, type PersonaId } from '../data/personas';
import { optimize } from '../engine/schedule';
import { HomeCareSummary } from '../components/habits/HomeCareSummary';
import { dentistSummary } from '../habits/analytics';
import { SMILESTREAK } from '../habits/program';
import { useHabitStore } from '../habits/store';
import { todayISO } from '../lib/dates';
import { formatDate } from '../lib/format';
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
  const habits = useHabitStore((s) => (s.personaId === personaId && s.consent.shareWithDentist ? s.sessions : null));
  const asOf = useAppStore((s) => s.profile.asOf);
  const homeCare = useMemo(() => (habits ? dentistSummary(habits, asOf, SMILESTREAK) : null), [habits, asOf]);

  // A link made through the API carries its own snapshot, so it shows the member's real plan on any device.
  const shared = useQuery({ queryKey: ['share', token], queryFn: () => api.getShare(token), retry: false });
  const snap = shared.data;
  const care = snap ? snap.homeCare : homeCare;

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
      {shared.isPending ? (
        <p className="mx-auto max-w-3xl text-sm text-muted">Loading the shared plan…</p>
      ) : snap ? (
        <HandoffSheet patientName={snap.patientName} procedures={snap.procedures} schedule={snap.schedule} rulesVersion={snap.rulesVersion} />
      ) : (
        <HandoffSheet patientName={PERSONAS[personaId].name} procedures={profile.procedures} schedule={schedule} rulesVersion={profile.currentPlan.version} />
      )}
      {snap && (
        <p className="mx-auto mt-2 max-w-3xl text-xs text-muted">
          Shared {formatDate(snap.sharedAt.slice(0, 10), { year: true })}. This link expires {formatDate(snap.expiresAt, { year: true })}.
        </p>
      )}
      <section className="card mx-auto mt-4 max-w-3xl" aria-labelledby="homecare-title">
        <h2 id="homecare-title" className="text-lg font-semibold">Home-care summary</h2>
        {care ? (
          <HomeCareSummary summary={care} patientName={snap?.patientName ?? PERSONAS[personaId].name} />
        ) : (
          <p className="mt-1 text-sm text-muted">The patient hasn’t shared smart-brush data. You can confirm good home care at the visit instead.</p>
        )}
      </section>
      <EstimateFooter />
    </div>
  );
}
