// Picks the Winnow backend: a reachable server URL, the queue to the Mac worker, or the labelled simulation.
// Whatever is chosen, a failure falls back to the simulation (the spec's "slower but still correct" path).
import { callBedrock } from '../lib/bedrock';
import { logWarn } from '../lib/log';
import { queuedWinnow } from '../lib/winnowQueue';
import { liveWinnow, simulatedWinnow, type Decide } from './winnow';

export function makeDecide(): { decide: Decide; mode: 'live' | 'queue' | 'simulated' } {
  const temperature = Number(process.env.WINNOW_TEMPERATURE || 1);
  const simulated = simulatedWinnow(callBedrock);
  const url = process.env.WINNOW_URL ?? '';
  const queue = process.env.WINNOW_QUEUE_URL ?? '';
  const primary = url ? liveWinnow(url, process.env.WINNOW_API_KEY ?? '', temperature) : queue ? queuedWinnow(queue, temperature) : undefined;
  if (!primary) return { decide: simulated, mode: 'simulated' };
  const decide: Decide = async (state, questions) => {
    try {
      return await primary(state, questions);
    } catch (err) {
      logWarn('winnow.unavailable_using_simulation', err);
      return simulated(state, questions);
    }
  };
  return { decide, mode: url ? 'live' : 'queue' };
}
