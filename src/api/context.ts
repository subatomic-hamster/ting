// Who the API is acting for. The demo panel switches persona and "as of" date; both backends read this.
import type { PersonaId } from '../data/personas';
import { todayISO } from '../lib/dates';

export const apiContext: { personaId: PersonaId; asOf: string } = { personaId: 'dale', asOf: todayISO() };

export function configureApi(opts: { personaId?: PersonaId; asOf?: string }) {
  if (opts.personaId) apiContext.personaId = opts.personaId;
  if (opts.asOf) apiContext.asOf = opts.asOf;
}
