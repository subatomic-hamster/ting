// F2 channel 2: a private forwarding address per member, for what Lincoln can't see (out-of-network bills,
// FSA receipts, a dentist's emailed treatment plan). Ting never connects to a mailbox; the member forwards.
// Pure rules here; SES inbound (production) and the demo simulator both apply them.

export interface InboundEmail {
  from: string;
  subject: string;
  text: string;
  /** SPF / DKIM / DMARC results from SES. */
  auth: { spf: boolean; dkim: boolean; dmarc: boolean };
}

export type InboundDecision =
  | { action: 'reject'; reason: string }
  | { action: 'hold'; reason: string }
  | { action: 'accept' };

/** Random-looking but stable per member; rotating it changes the salt. */
export function forwardingAddress(memberId: string, salt = 'v1'): string {
  let h = 2166136261;
  for (const ch of `${salt}:${memberId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `u-${(h >>> 0).toString(36)}@in.ting.app`;
}

const normal = (a: string) => a.trim().toLowerCase();

/** Spec: authentication must pass, and the sender must be the member or a dentist they approved; unknown senders wait. */
export function decideInbound(mail: InboundEmail, memberEmail: string | undefined, approved: string[]): InboundDecision {
  if (!mail.auth.spf || !mail.auth.dkim || !mail.auth.dmarc) return { action: 'reject', reason: 'Sender authentication (SPF, DKIM or DMARC) failed' };
  const from = normal(mail.from);
  if ((memberEmail && from === normal(memberEmail)) || approved.map(normal).includes(from)) return { action: 'accept' };
  return { action: 'hold', reason: `We got an email from ${mail.from}. Add it to your account?` };
}
