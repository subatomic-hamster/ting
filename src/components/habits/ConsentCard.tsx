import type { RewardSummary } from "../../habits/types";
import { useHabitStore } from "../../habits/store";
import { formatMoney } from "../../lib/format";
import { CheckIcon, CloseIcon } from "../Icons";

/** The opt-in moment: a plain statement of the exchange, like a safe-driving app's. */
export function ConsentCard({ rewards }: { rewards: RewardSummary }) {
  const optIn = useHabitStore((s) => s.optIn);

  return (
    <section
      className="card border-brand-200 bg-brand-50"
      aria-labelledby="consent-title"
    >
      <p className="eyebrow">Optional · rewards only</p>
      <h2 id="consent-title" className="mt-1 text-xl font-semibold">
        Share brushing data, earn up to {formatMoney(rewards.cap)} a year
      </h2>
      <p className="mt-1 text-sm text-muted">
        Earn program credits without changing your premium or claim decisions.
        Your cleanings already count:
        {rewards.wouldEarn > 0 ? (
          <>
            {" "}
            you’d start with{" "}
            <strong className="text-ink">
              {formatMoney(rewards.wouldEarn)}
            </strong>{" "}
            today.
          </>
        ) : (
          " book one and it earns a credit, no device needed."
        )}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ul className="space-y-1.5 text-sm">
          <li className="font-semibold">What you share</li>
          {[
            "Daily brushing sessions: length, areas covered, pressure warnings",
            "Starting today; nothing from before",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <CheckIcon className="mt-0.5 shrink-0 text-save" /> {t}
            </li>
          ))}
        </ul>
        <ul className="space-y-1.5 text-sm">
          <li className="font-semibold">What never happens</li>
          {[
            "Your premium or claims are never affected",
            "Your employer never sees brushing data",
            "No location, camera or microphone",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <CloseIcon className="mt-0.5 shrink-0 text-cost" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={optIn}>
          Opt in to SmileStreak
        </button>
        <span className="text-xs text-muted">
          Leave anytime to stop collection and delete sessions stored in this
          app. Previously shared summaries remain in those copies until their
          links expire. No smart brush? Your dentist can confirm instead.
        </span>
      </div>
    </section>
  );
}
