// The 1st of every month: the monthly overview email for every member who has one on.
import { deliverMonthly } from './lib/notify';

export async function handler() {
  const sent = await deliverMonthly(new Date().toISOString().slice(0, 10));
  console.log(
    JSON.stringify({
      sent: sent.map((s) => ({ member: s.member, sent: s.sent })),
    }),
  );
  return { sent: sent.length };
}
