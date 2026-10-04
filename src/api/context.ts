// Who the API is acting for. The demo panel switches persona and "as of" date; both backends read this.
// `personaId` is a member key: a demo persona id, or a signed-up member's id (`U-…`).
import { todayISO } from '../lib/dates';

export const apiContext: { personaId: string; asOf: string } = { personaId: 'dale', asOf: todayISO() };

export function configureApi(opts: { personaId?: string; asOf?: string }) {
  if (opts.personaId) apiContext.personaId = opts.personaId;
  if (opts.asOf) apiContext.asOf = opts.asOf;
}
