import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { currentMemberId } from "../../auth/auth";
import { habitEffect, type HabitSignal } from "../../engine/risk";
import { useHabitStore } from "../../habits/store";
import { formatPercent } from "../../lib/format";
import { useMemberRecord } from "../useMemberRecord";
import { Section } from "../Section";

/** Days of brushing data before Ting uses it (matches `habitPoints` in the dental profile). */
const MIN_DAYS = 14;

/**
 * F3: brushing data the member chooses to share updates their dental profile. Only for signed-up members:
 * the record is where the shared signal lives, and the profile card on the dashboard rebuilds from it.
 */
export function ProfileSyncCard({ signal }: { signal: HabitSignal | null }) {
  const record = useMemberRecord();
  const optedIn = useHabitStore((s) => s.consent.optedIn);
  const sessions = useHabitStore((s) => s.sessions);
  const importSample = useHabitStore((s) => s.importSample);
  const qc = useQueryClient();
  const share = useMutation({
    mutationFn: (s: HabitSignal) => api.shareHabits(s),
    onSuccess: (rec) => qc.setQueryData(["member", currentMemberId()], rec),
  });
  if (!record) return null;

  const sample = sessions.some((s) => s.source === "seed" || s.source === "simulated");
  const enough = !!signal && signal.days >= MIN_DAYS;
  const shared = record.habits && record.habits.days >= MIN_DAYS ? record.habits : undefined;
  const effect = habitEffect(record.survey, record.habits);
  const sameAsShared =
    shared && signal && shared.days === signal.days && shared.twiceDailyRate === signal.twiceDailyRate;

  return (
    <Section title="Update my dental profile" id="profile-sync">
      <p className="text-sm text-muted">
        Your dental profile starts from your sign-up answers. If you choose, your
        brushing record can adjust it: twice-a-day brushing on at least 80% of
        days lowers your cavity risk one step, and under 40% raises it. Ting
        needs {MIN_DAYS} days of data first.
      </p>

      {!enough && (
        <div className="mt-4">
          {optedIn && signal && (
            <p className="mb-3 text-sm" role="status">
              {signal.days} day{signal.days === 1 ? "" : "s"} of data so far.
              Brush for {MIN_DAYS - signal.days} more, or load sample data.
            </p>
          )}
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={importSample}
          >
            Import last 30 days from my brush app (sample data)
          </button>
          <p className="mt-2 text-xs text-muted">
            Demo: loads 30 days of simulated sessions and opts you in to
            SmileStreak. No real brush data is read.
          </p>
        </div>
      )}

      {enough && signal && (
        <div className="mt-4">
          <p className="text-base" data-testid="habit-signal">
            Twice-a-day brushing on{" "}
            <strong>{formatPercent(signal.twiceDailyRate)}</strong> of the last{" "}
            {signal.days} days{sample ? " (sample data)" : ""}.
          </p>
          {!sameAsShared && (
            <button
              type="button"
              className="btn-primary mt-3 w-full sm:w-auto"
              disabled={share.isPending}
              onClick={() => share.mutate(signal)}
            >
              {share.isPending ? "Updating…" : "Share with Ting to update my profile"}
            </button>
          )}
          {share.isError && (
            <p role="alert" className="mt-2 text-sm text-cost">
              Could not update your profile. Please try again.
            </p>
          )}
        </div>
      )}

      {shared && (
        <div className="mt-4 border-l-2 border-save pl-3" role="status" data-testid="habit-result">
          <p className="font-medium">Your profile was updated</p>
          <p className="mt-1 text-sm">
            {effect
              ? effect.text
              : "Your brushing is in the middle range, so your cavity risk didn't change."}
          </p>
          <div className="flex flex-wrap gap-x-3">
            <Link to="/" className="btn-ghost -ml-4">
              See my dental profile
            </Link>
            <button
              type="button"
              className="btn-ghost"
              disabled={share.isPending}
              onClick={() => share.mutate({ twiceDailyRate: 0, days: 0 })}
            >
              Stop using my brushing data
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
