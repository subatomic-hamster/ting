// Browser notifications, behind feature detection and the user's permission.

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Shows a system notification if allowed; returns whether one was shown. */
export function notify(title: string, body: string, tag: string): boolean {
  if (notificationPermission() !== 'granted') return false;
  try {
    new Notification(title, { body, tag });
    return true;
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
    return false;
  }
}
