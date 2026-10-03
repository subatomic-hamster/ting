import { Link } from 'react-router-dom';
import { daysLeftInYear, yearOf } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore, useResult } from '../store';
import { BellIcon } from './Icons';

/** Year-end reminder: shown in the last month of the plan year. */
export function LeftOnTableBanner({ force = false }: { force?: boolean }) {
  const asOf = useAppStore((s) => s.asOf);
  const { leftOnTable, fsa } = useResult();
  const days = daysLeftInYear(asOf);
  if (!force && days > 31) return null;

  const parts: string[] = [];
  if (leftOnTable.maxRemaining > 0) parts.push(`${formatMoney(leftOnTable.maxRemaining)} of annual max`);
  if (leftOnTable.unusedCleanings > 0)
    parts.push(`${leftOnTable.unusedCleanings} covered cleaning${leftOnTable.unusedCleanings > 1 ? 's' : ''}`);
  if (leftOnTable.fsaExpiring > 0) parts.push(`${formatMoney(leftOnTable.fsaExpiring)} of FSA expiring ${formatDate(fsa.forfeitDate)}`);

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900" aria-hidden>
        <BellIcon width={20} height={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-950">
          Left on the table: {days} day{days === 1 ? '' : 's'} left in {yearOf(asOf)}
        </p>
        <p className="text-sm text-amber-900">
          {parts.length
            ? `Before Dec 31 you still have ${parts.join(', ')}. After that, it's gone.`
            : "You're on track to use this year's benefits. Nice."}
        </p>
      </div>
      {parts.length > 0 && (
        <Link to="/treatment" className="btn-primary shrink-0 self-start sm:self-auto">
          Plan it
        </Link>
      )}
    </div>
  );
}
