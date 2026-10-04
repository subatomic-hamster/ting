// Daily EventBridge rule target: send the year-end reminders and the digests that are due today.
import { deliverDigests } from './lib/digest';
import { makeDecide } from './ai/winnowDecide';
import { deliverDue } from './lib/reminders';

const { decide } = makeDecide();

export async function handler() {
  const today = new Date().toISOString().slice(0, 10);
  const delivered = await deliverDue(today, decide);
  const digests = await deliverDigests(today);
  console.log(JSON.stringify({ delivered, digests: digests.map((d) => ({ member: d.member, emailed: d.emailed, pushedTo: d.pushedTo })) }));
  return { delivered: delivered.length, digests: digests.length };
}
