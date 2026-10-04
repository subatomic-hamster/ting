// The 1st of every month: the monthly overview email for every member who has one on.
import { logInfo } from './lib/log';
import { deliverMonthly } from './lib/notify';

export async function handler() {
  const sent = await deliverMonthly(new Date().toISOString().slice(0, 10));
  logInfo('monthly.done', { members: sent.length, sent: sent.filter((s) => s.sent).length });
  return { sent: sent.length };
}
