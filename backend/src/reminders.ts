// Daily EventBridge rule target: send the year-end reminders that are due today.
import { deliverDue } from './lib/reminders';

export async function handler() {
  const delivered = await deliverDue(new Date().toISOString().slice(0, 10));
  console.log(JSON.stringify({ delivered }));
  return { delivered: delivered.length };
}
