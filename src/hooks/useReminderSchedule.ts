import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { downloadIcs } from '../lib/ics';
import { useAppStore, useReminders } from '../store';

/** Opt in or out of year-end reminders through the API seam, and export them to a calendar. */
export function useReminderSchedule() {
  const { reminders, status } = useReminders();
  const scheduled = useAppStore((s) => s.scheduledReminders);
  const setScheduled = useAppStore((s) => s.setScheduledReminders);

  const toggle = useMutation({
    mutationFn: async () => {
      if (scheduled) {
        await Promise.all(scheduled.map((r) => api.cancelReminder(r.reminderId)));
        return null;
      }
      return Promise.all(reminders.map((r) => api.scheduleReminder(r)));
    },
    onSuccess: setScheduled,
  });

  const exportIcs = () =>
    downloadIcs(
      'ting-benefit-reminders.ics',
      reminders.map((r) => ({ uid: `reminder-${r.id}`, title: r.title, date: r.sendOn, description: r.body, alarm: 'PT9H' })),
    );

  return { reminders, status, on: scheduled !== null, toggle, exportIcs };
}
