import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../lib/format';
import { notify } from '../lib/notify';
import { useAppStore, useReminders } from '../store';
import { BellIcon, CloseIcon } from './Icons';

/** A reminder the member opted into, shown when it comes due (try "Simulate Dec 1" in the demo panel). */
export function ReminderToast() {
  const { reminders, status } = useReminders();
  const scheduled = useAppStore((s) => s.scheduledReminders);
  const dismissed = useAppStore((s) => s.dismissedReminders);
  const dismiss = useAppStore((s) => s.dismissReminder);
  const addTrace = useAppStore((s) => s.addTrace);
  const fired = useRef<{ for: unknown; ids: Set<string> }>({ for: null, ids: new Set() });

  const due = scheduled ? reminders.find((r) => status.get(r.id) === 'due' && !dismissed.includes(r.id)) : undefined;
  const dueId = due?.id;
  const title = due?.title ?? '';
  const body = due?.body ?? '';

  // Fire once per opt-in: a browser notification (if allowed) and an audit-trail entry.
  useEffect(() => {
    if (!dueId) return;
    if (fired.current.for !== scheduled) fired.current = { for: scheduled, ids: new Set() };
    if (fired.current.ids.has(dueId)) return;
    fired.current.ids.add(dueId);
    const shown = notify(title, body, dueId);
    addTrace({ ts: new Date().toISOString(), tool: 'reminder.fire', summary: `${title}${shown ? ' (browser notification)' : ''}`, ms: 0 });
  }, [dueId, title, body, scheduled, addTrace]);

  if (!due) return null;

  return (
    <div
      role="alert"
      className="no-print fixed top-3 right-3 left-3 z-40 rounded-2xl border border-amber-300 bg-white p-4 shadow-xl sm:left-auto sm:w-96"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900" aria-hidden>
          <BellIcon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-amber-800">Ting reminder · {formatDate(due.sendOn, { year: true })}</p>
          <p className="font-semibold">{due.title}</p>
          <p className="mt-0.5 text-sm text-muted">{due.body}</p>
          <Link to="/treatment" className="btn-primary mt-2" onClick={() => dismiss(due.id)}>
            Plan it
          </Link>
        </div>
        <button type="button" className="rounded p-1 text-muted hover:bg-amber-50" onClick={() => dismiss(due.id)} aria-label="Dismiss reminder">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
