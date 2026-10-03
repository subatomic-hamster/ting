// Calendar helpers. All dates are ISO "YYYY-MM-DD" strings interpreted in UTC
// so that a date never shifts with the viewer's time zone.

const DAY_MS = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / DAY_MS);
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function startOfYear(year: number): string {
  return `${year}-01-01`;
}

export function endOfYear(year: number): string {
  return `${year}-12-31`;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function clampDate(iso: string, lo: string, hi: string): string {
  return minDate(maxDate(iso, lo), hi);
}

/** True when `iso` falls in the open-enrollment window (Oct 15 – Nov 30). */
export function isEnrollmentWindow(iso: string): boolean {
  const md = iso.slice(5, 10);
  return md >= '10-15' && md <= '11-30';
}

/** Days from `asOf` until the end of its calendar year. */
export function daysLeftInYear(asOf: string): number {
  return diffDays(endOfYear(yearOf(asOf)), asOf);
}
