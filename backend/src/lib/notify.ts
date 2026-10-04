// Member-facing emails beyond replies: the monthly overview and urgent alerts.
import type { Member } from '../../../src/data/members';
import { monthlyOverview } from '../../../src/engine/overview';
import { optimize } from '../../../src/engine/schedule';
import { allContacts, getContact } from './corpus';
import { sendEmail } from './email';
import { monthlyEmail, urgentEmail } from './emailTemplates';
import { isMemberKey, memberOf } from './members';
import { memberProfile } from './profile';
import { pushToMember } from './push';

const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';

export async function sendMonthly(who: Member, asOf: string) {
  const contact = await getContact(who.memberId);
  if (!contact?.email) return { sent: false, reason: 'no email on file' };
  const profile = await memberProfile(who, asOf);
  const overview = monthlyOverview(profile, optimize(profile, { horizon: 2 }).cheapest);
  const r = monthlyEmail(who.name, overview, contact.detail !== 'private');
  const res = await sendEmail({
    member: who.memberId,
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
    if (c.monthly !== false && isMemberKey(c.key))
      out.push({
        member: c.member,
        ...(await sendMonthly(await memberOf(c.key), asOf)),
      });
  return out;
}

/** Something important happened outside the member's own emails (a plan change, a denial, their dentist wrote in). */
export async function sendUrgent(who: Member, what: string, details: string[], actions: string[]) {
  const contact = await getContact(who.memberId);
  if (WS_ENDPOINT) await pushToMember(WS_ENDPOINT, who.memberId, { type: 'urgent', what });
  if (!contact?.email || contact.urgent === false) return { sent: false };
  const r = urgentEmail(who.name, what, details, actions, contact.detail !== 'private');
  return {
    sent: true,
    ...(await sendEmail({
      member: who.memberId,
      kind: 'urgent',
      to: contact.email,
      subject: r.subject,
      text: r.text,
      html: r.html,
    })),
  };
}
