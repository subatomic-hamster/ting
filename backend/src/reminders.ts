// Daily EventBridge rule target: send the year-end reminders and the digests that are due today.
import { deliverDigests } from './lib/digest';
import { makeDecide } from './ai/winnowDecide';
import { logInfo } from './lib/log';
import { deliverDue } from './lib/reminders';

const { decide } = makeDecide();

export async function handler() {
  const today = new Date().toISOString().slice(0, 10);
  const delivered = await deliverDue(today, decide);
  const digests = await deliverDigests(today);
  logInfo('reminders.done', { reminders: delivered.length, digests: digests.length, digestsEmailed: digests.filter((d) => d.emailed).length });
  return { delivered: delivered.length, digests: digests.length };
}
