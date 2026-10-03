import { useMemo } from 'react';
import { useAppStore } from '../store';
import { adherence, calendarDays, currentStreak, dentistSummary } from './analytics';
import { SMILESTREAK } from './program';
import { computeRewards } from './rewards';
import { useHabitStore } from './store';

/** Everything the SmileStreak screens show, derived once per state change. */
export function useSmileStreak() {
  const sessions = useHabitStore((s) => s.sessions);
  const consent = useHabitStore((s) => s.consent);
  const dentistCheck = useHabitStore((s) => s.dentistCheck);
  const ledger = useAppStore((s) => s.ledger);
  const asOf = useAppStore((s) => s.asOf);

  return useMemo(
    () => ({
      program: SMILESTREAK,
      rewards: computeRewards({ program: SMILESTREAK, sessions, ledger, consent, asOf, dentistCheck }),
      adherence: adherence(sessions, asOf, SMILESTREAK),
      streak: currentStreak(sessions, asOf, SMILESTREAK),
      calendar: calendarDays(sessions, asOf, SMILESTREAK, consent.consentedAt),
      dentist: dentistSummary(sessions, asOf, SMILESTREAK),
    }),
    [sessions, consent, dentistCheck, ledger, asOf],
  );
}
