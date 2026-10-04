// One-tap sample emails for the demo, written for the member who taps them: their name and member ID are in the text
// (so de-identification has something to remove), and every dollar comes from their plan and the fee table.
import { addDays } from './dates';
import { usd } from './format';
import type { ISODate, Profile } from './types';

export interface SampleEmail {
  id: 'eob' | 'plan' | 'xray' | 'alert';
  label: string;
  /** What Ting should do with it, in a few words. */
  hint: string;
  fromDentist?: boolean;
  subject: string;
  text: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

export function sampleEmails(member: { name: string; memberId: string }, profile: Profile, today: ISODate): SampleEmail[] {
  const first = member.name.split(/\s+/)[0] || 'there';
  const { fees, currentPlan: plan, ledger } = profile;
  const billed = (cdt: string, fallback: number) => fees[cdt]?.billed ?? fallback;

  // A root canal done earlier this year, as the insurer's EOB would show it for this member's plan.
  const earlier = addDays(today, -45);
  const served = earlier.slice(0, 4) === today.slice(0, 4) ? earlier : today;
  const rc = fees.D3330;
  const allowed = rc?.inNetwork ?? rc?.billed ?? 800;
  const cls = plan.categoryClass.endodontics;
  const rate = cls === 'excluded' ? 0 : plan.coinsurance.inNetwork[cls];
  const applies = cls !== 'excluded' && plan.deductible.appliesTo.includes(cls);
  const deductible = applies ? Math.min(allowed, Math.max(0, round2(plan.deductible.amount - ledger.deductibleMet))) : 0;
  const planPaid = round2((allowed - deductible) * rate);
  const owes = round2(allowed - planPaid);
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return [
    {
      id: 'eob',
      label: 'Insurance claim (EOB) for a past root canal',
      hint: 'Records the visit, updates your annual max and deductible',
      subject: 'Fwd: Your Explanation of Benefits',
      text: `Acme Dental - Explanation of Benefits. This is not a bill.\nPatient: ${member.name}\nMember ID: ${member.memberId}\nClaim number: C-${served.slice(0, 4)}-${served.slice(5, 7)}-0587. Date of service: ${usDate(served)}. Provider: Greensboro Family Dental.\nD3330 Root canal - molar #19 . Billed ${money(billed('D3330', 1180))} Allowed ${money(allowed)} Deductible ${money(deductible)} Plan paid ${money(planPaid)} You owe ${money(owes)}`,
    },
    {
      id: 'plan',
      label: 'Dentist: treatment plan for upcoming work',
      hint: 'Adds the work to your plan, priced for your plan',
      fromDentist: true,
      subject: 'Your treatment plan',
      text: `Hi ${first}, here is the treatment plan we discussed. Patient: ${member.name}\n#3 D2392 composite filling, two surfaces . ${usd(billed('D2392', 210))}\n#30 D2740 porcelain crown . ${usd(billed('D2740', 1450))}\nThe filling is routine; the crown can be done any time in the next six months.\nCollege Hill Dental, (336) 555-0142`,
    },
    {
      id: 'xray',
      label: 'Dentist: urgent x-ray result',
      hint: 'Marks the work urgent and sends an alert',
      fromDentist: true,
      subject: 'Your x-ray results',
      text: `Hi ${first}, following up on today's x-rays. Tooth #14 has a deep cavity that has reached the nerve. You need a root canal immediately, followed by a porcelain crown on #14, within the next 3 weeks to avoid an infection. Quoted fees: root canal ${usd(billed('D3330', 1180))}, crown ${usd(billed('D2740', 1450))}.\nDr. Patel, College Hill Dental, (336) 555-0142`,
    },
    {
      id: 'alert',
      label: 'Emergency: dentist says a root canal is needed now',
      hint: 'An example of the urgent alert',
      fromDentist: true,
      subject: 'Urgent: infection on tooth #18',
      text: `Hi ${first}, this is College Hill Dental. Your exam shows an abscess on tooth #18. This is an emergency: you need a root canal immediately to stop the infection spreading.\nCall us at (336) 555-0142 today.`,
    },
  ];
}
