// Member-facing emails beyond replies: the monthly overview and urgent alerts.
import { PERSONAS, type PersonaId } from '../../../src/data/personas';
import { monthlyOverview } from '../../../src/engine/overview';
import { optimize } from '../../../src/engine/schedule';
import { allContacts, getContact } from './corpus';
import { sendEmail } from './email';
import { monthlyEmail, urgentEmail } from './emailTemplates';
import { memberProfile } from './profile';
import { pushToMember } from './push';

const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';

export async function sendMonthly(member: string, personaId: PersonaId, asOf: string) {
  const contact = await getContact(member);
  if (!contact?.email) return { sent: false, reason: 'no email on file' };
  const profile = await memberProfile(personaId, asOf);
  const overview = monthlyOverview(profile, optimize(profile, { horizon: 2 }).cheapest);
  const r = monthlyEmail(PERSONAS[personaId].name, overview, contact.detail !== 'private');
  const res = await sendEmail({
    member,
    kind: 'monthly',
    to: contact.email,
    subject: r.subject,
    text: r.text,
    html: r.html,
  });
  return { sent: true, ...res, overview };
}

/** The 1st of each month: everyone who has monthly emails on. */
export async function deliverMonthly(asOf: string) {
  const out = [];
  for (const c of await allContacts())
    if (c.monthly !== false)
      out.push({
        member: c.member,
        ...(await sendMonthly(c.member, c.personaId, asOf)),
      });
  return out;
}

/** Something important happened outside the member's own emails (a plan change, a denial, their dentist wrote in). */
export async function sendUrgent(member: string, personaId: PersonaId, what: string, details: string[], actions: string[]) {
  const contact = await getContact(member);
  if (WS_ENDPOINT) await pushToMember(WS_ENDPOINT, member, { type: 'urgent', what });
  if (!contact?.email || contact.urgent === false) return { sent: false };
  const r = urgentEmail(PERSONAS[personaId].name, what, details, actions, contact.detail !== 'private');
  return {
    sent: true,
    ...(await sendEmail({
      member,
      kind: 'urgent',
      to: contact.email,
      subject: r.subject,
      text: r.text,
      html: r.html,
    })),
  };
}
