import type { ISODate } from '../engine/types';

export interface CalendarEvent {
  date: ISODate;
  title: string;
  description: string;
}

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** All-day events as an .ics file any calendar app can import. */
export function toIcs(events: CalendarEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const body = events.flatMap((e, i) => {
    const d = e.date.replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:ting-${d}-${i}@ting.app`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description)}`, 'END:VEVENT'];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ting//Dental decisions//EN', ...body, 'END:VCALENDAR'].join('\r\n');
}

export function download(filename: string, text: string, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
