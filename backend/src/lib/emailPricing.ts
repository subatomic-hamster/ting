// Work the email agent learns from a document is priced like any other in-network work. The intake path marks a
// procedure that came with a quoted fee `allowancePending` (a quote has no confirmed allowance), which makes the
// engine charge the full billed fee: a dentist's "$1,180" root canal showed "you pay $1,180" although the same code
// at the same in-network dentist costs the member the contracted fee. When the member's dentist is in network, the
// contracted fee for the code (the fee table's in-network entry) is the allowance; the quote stays the billed fee.
import dentists from '../../../src/fixtures/dentists.json';
import type { PlannedProcedure, Profile } from '../../../src/engine/types';

/** Unknown dentists are treated as in network (the intake default). */
export const dentistInNetwork = (dentistId: string) => dentists.dentists.find((d) => d.id === dentistId)?.inNetwork ?? true;

export function priceEmailed(proc: PlannedProcedure, profile: Profile, inNetwork: boolean): PlannedProcedure {
  if (!proc.allowancePending) return proc;
  const entry = profile.fees[proc.cdt];
  const { allowancePending: _pending, ...rest } = proc;
  const feeSource = { kind: 'quote' as const, label: 'Fee quoted in a document you emailed to Ting' };
  if (inNetwork && entry?.inNetwork !== undefined) return { ...rest, inNetwork: true, feeSource, allowedFee: entry.inNetwork, allowedFeeSource: entry.source };
  // Out of network (or no contracted fee on file): the allowance stays unconfirmed, as the intake path leaves it.
  return { ...proc, inNetwork, feeSource };
}
