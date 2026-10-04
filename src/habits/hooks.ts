import { useMemo } from 'react';
import { useAppStore } from '../store';
import { adherence, calendarDays, currentStreak, dentistSummary, habitSignal } from './analytics';
import { SMILESTREAK } from './program';
import { computeRewards } from './rewards';
import { useHabitStore } from './store';

/** Everything the SmileStreak screens show, derived once per state change. */
export function useSmileStreak() {
  const sessions = useHabitStore((s) => s.sessions);
  const consent = useHabitStore((s) => s.consent);
  const dentistCheck = useHabitStore((s) => s.dentistCheck);
  const ledger = useAppStore((s) => s.profile.ledger.history);
  const asOf = useAppStore((s) => s.profile.asOf);

  return useMemo(
    () => ({
      program: SMILESTREAK,
      rewards: computeRewards({ program: SMILESTREAK, sessions, ledger, consent, asOf, dentistCheck }),
      adherence: adherence(sessions, asOf, SMILESTREAK),
      signal: consent.optedIn ? habitSignal(sessions, asOf, SMILESTREAK, consent.consentedAt) : null,
      streak: currentStreak(sessions, asOf, SMILESTREAK),
      calendar: calendarDays(sessions, asOf, SMILESTREAK, consent.consentedAt),
      dentist: dentistSummary(sessions, asOf, SMILESTREAK),
    }),
    [sessions, consent, dentistCheck, ledger, asOf],
  );
}
