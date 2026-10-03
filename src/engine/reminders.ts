// Year-end reminders: what the member would lose at the deadline, and when to tell them.
// Pure, so the AWS side can run it in Lambda at send time (EventBridge Scheduler + SES) and
// send exactly the text the app shows.

import { addDays, yearOf } from './dates';
import { usd } from './format';
import { leftOnTable } from './helpers';
import type { ISODate, Profile, ScheduleEvaluation } from './types';

export type ReminderKind = 'nov1' | 'dec1' | 'fsa';
export type ReminderStatus = 'scheduled' | 'due' | 'sent';

export interface Reminder {
  /** Stable per member and year, so scheduling the same reminder twice replaces it. */
  id: string;
  kind: ReminderKind;
  sendOn: ISODate;
  title: string;
  body: string;
  /** The engine amounts the text was built from. */
  maxRemaining: number;
  unusedCleanings: number;
  fsaExpiring: number;
  fsaDeadline: ISODate;
}

/** Days before the FSA deadline for the last-call reminder. */
export const FSA_LEAD_DAYS = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: ISODate) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
const cleaningsText = (n: number) => `${n} covered cleaning${n === 1 ? '' : 's'}`;

function listText(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Reminders for the plan year of `profile.asOf`: Nov 1 and Dec 1 while anything is left on the table,
 * and one FSA_LEAD_DAYS before the FSA deadline when FSA money would be forfeited.
 * Amounts come from leftOnTable for the given schedule.
 */
export function buildReminders(profile: Profile, ev: ScheduleEvaluation): Reminder[] {
  const left = leftOnTable(profile, ev);
  const year = yearOf(profile.asOf);
  const amounts = {
    maxRemaining: left.maxRemaining,
    unusedCleanings: left.unusedCleanings,
    fsaExpiring: left.fsaExpiring,
    fsaDeadline: left.fsaDeadline,
  };
  const out: Reminder[] = [];

  const parts: string[] = [];
  if (left.maxRemaining > 0) parts.push(`${usd(left.maxRemaining)} of annual max`);
  if (left.unusedCleanings > 0) parts.push(cleaningsText(left.unusedCleanings));
  const fsaThisYear = left.fsaExpiring > 0 && yearOf(left.fsaDeadline) === year;
  if (fsaThisYear) parts.push(`${usd(left.fsaExpiring)} of FSA money`);

  if (parts.length) {
    const what = listText(parts);
    out.push(
      {
        id: `${year}-nov1`,
        kind: 'nov1',
        sendOn: `${year}-11-01`,
        title: '2 months left to use your dental benefits',
        body: `You still have ${what} for ${year}. They reset on Jan 1, so book now while appointments are open.`,
        ...amounts,
      },
      {
        id: `${year}-dec1`,
        kind: 'dec1',
        sendOn: `${year}-12-01`,
        title: `Last month: ${what} left`,
        body: `You still have ${what} for ${year}. After Dec 31 it's gone.`,
        ...amounts,
      },
    );
  }

  if (left.fsaExpiring > 0) {
    out.push({
      id: `${year}-fsa`,
      kind: 'fsa',
      sendOn: addDays(left.fsaDeadline, -FSA_LEAD_DAYS),
      title: `${usd(left.fsaExpiring)} of FSA money expires in ${FSA_LEAD_DAYS} days`,
      body: `Your ${year} FSA money must be spent by ${longDate(left.fsaDeadline)}. Use ${usd(left.fsaExpiring)} on eligible care before then or forfeit it.`,
      ...amounts,
    });
  }

  return out.sort((a, b) => (a.sendOn < b.sendOn ? -1 : a.sendOn > b.sendOn ? 1 : 0));
}

/** The latest reminder on or before `asOf` is due; earlier ones were sent; later ones are scheduled. */
export function reminderStatus(reminders: Reminder[], asOf: ISODate): Map<string, ReminderStatus> {
  const past = reminders.filter((r) => r.sendOn <= asOf);
  const due = past.reduce<Reminder | undefined>((a, r) => (!a || r.sendOn >= a.sendOn ? r : a), undefined);
  return new Map(reminders.map((r) => [r.id, r.sendOn > asOf ? 'scheduled' : r === due ? 'due' : 'sent']));
}
