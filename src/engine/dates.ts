import type { ISODate } from './types';

// Dates are handled as UTC day numbers so time zones never move a claim across Dec 31.

const MS_PER_DAY = 86_400_000;

export function toDay(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDay(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function yearOf(iso: ISODate): number {
  return Number(iso.slice(0, 4));
}

export function yearStart(year: number): ISODate {
  return `${year}-01-01`;
}

export function yearEnd(year: number): ISODate {
  return `${year}-12-31`;
}

/** Day of the plan year, Jan 1 = 1. */
export function dayOfYear(iso: ISODate): number {
  return toDay(iso) - toDay(yearStart(yearOf(iso))) + 1;
}

/** Date of a given day of the year (day 65 = MaxRewards deposit). */
export function dateOfDay(year: number, day: number): ISODate {
  return fromDay(toDay(yearStart(year)) + day - 1);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDay(toDay(iso) + days);
}

/** Adds calendar months, clamping to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function maxDate(...dates: ISODate[]): ISODate {
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** First weekday on or after Jan 2: when a dental office can actually see you in a new plan year. */
export function firstBusinessDay(year: number): ISODate {
  let day = toDay(`${year}-01-02`);
  while ([0, 6].includes(new Date(day * MS_PER_DAY).getUTCDay())) day++;
  return fromDay(day);
}

export function formatDate(iso: ISODate): string {
  return new Date(toDay(iso) * MS_PER_DAY).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
