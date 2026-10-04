import { Link } from "react-router-dom";
import { leftOnTable } from "../engine/helpers";
import { daysLeftInYear, yearOf } from "../lib/dates";
import { formatDate, formatMoney } from "../lib/format";
import { useActive, useProfile } from "../store";
import { BellIcon } from "./Icons";

/** Year-end reminder: shown in the last month of the plan year. */
export function LeftOnTableBanner({ force = false }: { force?: boolean }) {
  const profile = useProfile();
  const left = leftOnTable(profile, useActive());
  const days = daysLeftInYear(profile.asOf);
  if (!force && days > 31) return null;

  const parts: string[] = [];
  if (left.maxRemaining > 0)
    parts.push(`${formatMoney(left.maxRemaining)} of annual max`);
  if (left.unusedCleanings > 0)
    parts.push(
      `${left.unusedCleanings} covered cleaning${left.unusedCleanings > 1 ? "s" : ""}`,
    );
  if (left.fsaExpiring > 0)
    parts.push(
      `${formatMoney(left.fsaExpiring)} of FSA expiring ${formatDate(left.fsaDeadline)}`,
    );

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center"
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900"
        aria-hidden
      >
        <BellIcon width={20} height={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-950">
          Left on the table: {days} day{days === 1 ? "" : "s"} left in{" "}
          {yearOf(profile.asOf)}
        </p>
        <p className="text-sm text-amber-900">
          {parts.length
            ? `Unused benefits: ${parts.join(", ")}. Confirm deadlines and carryover in your plan.`
            : "You're on track to use this year's benefits. Nice."}
        </p>
      </div>
      {parts.length > 0 && (
        <Link
          to="/treatment"
          className="btn-secondary shrink-0 self-start sm:self-auto"
        >
          Plan it
        </Link>
      )}
    </div>
  );
}
