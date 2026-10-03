// The only money code in the UI: turning engine numbers into text.
// Never compute amounts here — only format them.

import { cdtLabel } from '../engine/cdt';
import type { PlannedProcedure } from '../engine/types';

/** "Crown (porcelain) on #19", or the dentist's own label ("Braces (Arjun)"). */
export function procedureName(p: Pick<PlannedProcedure, 'cdt' | 'tooth' | 'label'>): string {
  return p.label ? `${p.label}${p.tooth ? ` on #${p.tooth}` : ''}` : cdtLabel(p.cdt, p.tooth);
}

const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 });

export interface MoneyFormat {
  /** Show a leading + or − (typographic minus). */
  signed?: boolean;
  /** Show cents (default: only when the value has cents). */
  cents?: boolean;
}

export function formatMoney(value: number, opts: MoneyFormat = {}): string {
  const abs = Math.abs(value);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const text = (opts.cents ?? hasCents ? cents : whole).format(abs);
  if (opts.signed) {
    if (value > 0) return `+${text}`;
    if (value < 0) return `−${text}`;
    return text;
  }
  return value < 0 ? `−${text}` : text;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso: string, opts: { year?: boolean } = {}): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return (opts.year ? longDate : shortDate).format(d);
}

export function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
