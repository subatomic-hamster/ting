import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { buildReminders, reminderStatus } from "../engine/reminders";
import { downloadIcs } from "../lib/ics";
import {
  useAppStore,
  useReminders,
  useProfile,
  type ActiveSchedule,
} from "../store";

/** Opt in or out of year-end reminders through the API seam, and export them to a calendar. */
export function useReminderSchedule(schedule?: ActiveSchedule) {
  const current = useReminders();
  const profile = useProfile();
  const reminders = schedule
    ? buildReminders(profile, schedule)
    : current.reminders;
  const status = schedule
    ? reminderStatus(reminders, profile.asOf)
    : current.status;
  const scheduled = useAppStore((s) => s.scheduledReminders);
  const setScheduled = useAppStore((s) => s.setScheduledReminders);

  const toggle = useMutation({
    mutationFn: async () => {
      if (scheduled) {
        await Promise.all(
          scheduled.map((r) => api.cancelReminder(r.reminderId)),
        );
        return null;
      }
      return Promise.all(reminders.map((r) => api.scheduleReminder(r)));
    },
    onSuccess: setScheduled,
  });

  const exportIcs = () =>
    downloadIcs(
      "ting-benefit-reminders.ics",
      reminders.map((r) => ({
        uid: `reminder-${r.id}`,
        title: r.title,
        date: r.sendOn,
        description: r.body,
        alarm: "PT9H",
      })),
    );

  return { reminders, status, on: scheduled !== null, toggle, exportIcs };
}
