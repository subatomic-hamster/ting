import { useState } from 'react';
import type { ReminderStatus } from '../engine/reminders';
import { useReminderSchedule } from '../hooks/useReminderSchedule';
import { formatDate } from '../lib/format';
import { notificationPermission } from '../lib/notify';
import { DemoDataPill } from './DemoDataPill';
import { BellIcon, CalendarIcon } from './Icons';
import { Section } from './Section';

const CHIP: Record<ReminderStatus | 'off', { label: string; className: string }> = {
  off: { label: 'Off', className: 'border-line bg-white text-muted' },
  scheduled: { label: 'Scheduled', className: 'border-brand-200 bg-brand-50 text-brand-700' },
  due: { label: 'Due now', className: 'border-amber-300 bg-amber-100 text-amber-900' },
  sent: { label: 'Sent', className: 'border-line bg-white text-muted' },
};

export function RemindersCard() {
  const { reminders, status, on, toggle, exportIcs } = useReminderSchedule();
  const [permission, setPermission] = useState(notificationPermission);

  const askPermission = () => {
    void Notification.requestPermission().then(setPermission);
  };

  return (
    <Section id="reminders" title="Scheduled reminders" actions={<DemoDataPill label="Demo: shown in the app" />}>
      <p className="text-sm text-muted">
        Your annual max and covered cleanings reset on Jan 1, and unspent FSA money is forfeited. Ting reminds you before that happens.
      </p>

      {reminders.length === 0 ? (
        <p className="mt-3 text-sm">Nothing is set to expire unused this year, so there's nothing to remind you about.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {reminders.map((r) => {
            const chip = CHIP[on ? (status.get(r.id) ?? 'scheduled') : 'off'];
            return (
              <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="tabular w-14 shrink-0 text-sm font-medium">
                  {formatDate(r.sendOn)}
                  <div className="text-xs font-normal text-muted">{r.sendOn.slice(0, 4)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted">{r.body}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={on ? 'btn-secondary' : 'btn-primary'}
          aria-pressed={on}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          <BellIcon /> {toggle.isPending ? 'Saving…' : on ? 'Turn off reminders' : 'Remind me'}
        </button>
        {reminders.length > 0 && (
          <button type="button" className="btn-secondary" onClick={exportIcs}>
            <CalendarIcon /> Add to calendar
          </button>
        )}
        {on && permission === 'default' && (
          <button type="button" className="btn-ghost" onClick={askPermission}>
            Also notify me in this browser
          </button>
        )}
      </div>
      {toggle.isError && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          Couldn't update reminders. Try again.
        </p>
      )}
      {on && (
        <p className="mt-2 text-xs text-muted" role="status">
          {permission === 'granted'
            ? 'Due reminders appear here and as a browser notification.'
            : permission === 'denied'
              ? 'Due reminders appear here. Browser notifications are blocked in this browser.'
              : 'Due reminders appear here in the app.'}{' '}
          Email delivery comes with the AWS backend.
        </p>
      )}
    </Section>
  );
}
