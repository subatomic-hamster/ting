// The email agent, in the browser: the offline demo's stand-in for backend/src/emailAgent.ts. One email in, the member's
// record updated, the new work planned and priced like any in-network work, and a reply. No model is involved:
// deterministic parsers read the email (the same ones the app uses for uploads), and a rule list decides urgency.
// Pure: it returns what to change (a claim for the ledger, procedures to plan) and what was sent; the caller applies it.
import dentists from '../fixtures/dentists.json';
import type { Contact, ReceivedDoc, SentEmail } from '../api';
import { isEobText, eobToClaim, parseEob } from '../intake/eob';
import { makeItem, parseDescription } from '../intake/describe';
import { toProcedures } from '../intake/questions';
import { parseTreatmentPlanText } from '../intake/treatmentPlan';
import type { IntakeItem } from '../intake/types';
import { planNewWork, type WorkPlan } from './agentPlan';
import { CDT, cdtLabel, nameOf } from './cdt';
import { HEDGED } from './decisions';
import { addDays, yearOf } from './dates';
import { usd } from './format';
import { applyClaim, type ClaimEvent } from './ledger';
import { replyEmail, shortDate, urgentEmail } from './localEmails';
import { redactPhi } from './phi';
import { claimsFromLedger, decideMatch, heuristicMatch, isInvoiceText, overbilling, parseInvoice } from './reconcile';
import type { ISODate, PlannedProcedure, Profile } from './types';

export interface LocalMail {
  from: string;
  subject: string;
  text: string;
  fromDentist?: boolean;
}

export interface LocalMember {
  name: string;
  memberId: string;
  email?: string;
  currentDentistId?: string;
}

export interface AgentInput {
  mail: LocalMail;
  member: LocalMember;
  profile: Profile;
  today: ISODate;
  /** ISO timestamp the email arrived. */
  at: string;
  contact?: Contact | null;
  /** Link target for the emails' button. */
  web?: string;
}

export interface AgentOutput {
  doc: ReceivedDoc;
  /** New work to add to the plan, priced. */
  procedures: PlannedProcedure[];
  /** Past services from an EOB, for the ledger (idempotent per claim id). */
  claim?: ClaimEvent;
  /** What the EOB says counted toward the deductible. */
  deductible: number;
  /** Newest last: the reply, then the urgent alert when there is one. */
  emails: SentEmail[];
  /** The member's profile once the agent's changes are applied. */
  profile: Profile;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- ledger helpers (shared with the upload path) ------------------------------------------------------------------

/** The claim's own deductible on top of what the engine already counted for matching planned work. */
export function deductibleAfter(plan: Profile['currentPlan'], ledger: Profile['ledger'], engineMet: number, claimDate: string, eobDeductible: number): number {
  if (yearOf(claimDate) !== ledger.planYear) return ledger.deductibleMet;
  return round2(Math.min(plan.deductible.amount, Math.max(engineMet, ledger.deductibleMet + eobDeductible)));
}

/** A claim applied to a profile the way the store does it, plus the EOB's deductible. */
export function applyEob(profile: Profile, claim: ClaimEvent, eobDeductible: number): { profile: Profile; completed: string[]; duplicate: boolean } {
  const up = applyClaim(profile, claim);
  if (up.duplicate) return { profile, completed: [], duplicate: true };
  const met = deductibleAfter(profile.currentPlan, profile.ledger, up.profile.ledger.deductibleMet, claim.serviceDate, eobDeductible);
  return { profile: { ...up.profile, ledger: { ...up.profile.ledger, deductibleMet: met } }, completed: up.completed, duplicate: false };
}

// --- reading the email ---------------------------------------------------------------------------------------------

const INJECTION = /ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:the )?(?:previous|above|prior)|reveal (?:your )?system prompt|you are now\b/i;
const STRONG = /\b(immediate(?:ly)?|urgent(?:ly)?|emergency|abscess(?:ed)?|swelling|severe pain|as soon as possible|asap|right away|infection)\b/i;
const RECOMMEND = /\b(recommend\w*|need\w*|require\w*|should|propos\w*|suggest\w*|advis\w*|schedule[ds]?|due for|plan(?:ned)?)\b/i;
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

/** "within the next 3 weeks", "in the next six months" → days. */
export function timeframeDays(text: string): number | undefined {
  const m = /\b(?:within|in) (?:the |about |roughly )?(?:next )?(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (day|week|month)s?\b/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]) || NUMBER_WORDS[m[1].toLowerCase()];
  return n ? n * UNIT_DAYS[m[2].toLowerCase()] : undefined;
}

export function isUrgentText(text: string): { urgent: boolean; days?: number } {
  const days = timeframeDays(text);
  return { urgent: STRONG.test(text) || (days !== undefined && days <= 28), days };
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};

interface Work {
  items: IntakeItem[];
  kind: 'treatment_plan' | 'dentist_note';
}

/** Procedures an email asks for: coded rows ("#30 D2740 crown $1,450") or the dentist's recommending sentences. */
function workIn(body: string): Work | undefined {
  const coded = body.split(/\r?\n/).filter((l) => /\bD\d{4}\b/.test(l)).join('\n');
  if (coded) {
    const items = parseTreatmentPlanText(coded, 'upload').items;
    if (items.length) return { items, kind: 'treatment_plan' };
  }
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => RECOMMEND.test(s) && !/\bfees?\s*:/i.test(s))
    .map((s) => s.replace(/\$\s*[\d,]+(?:\.\d{2})?/g, '').replace(/\bfollowed by\b/gi, ', then '));
  if (!sentences.length) return undefined;
  const items = parseDescription(sentences.join(' '), 'upload');
  if (!items.length) return undefined;
  // "Quoted fees: root canal $1,180, crown $1,450": a fee goes to the first item of the same kind of work.
  const taken = new Set<string>();
  for (const [, label, amount] of body.matchAll(/([A-Za-z][A-Za-z -]{2,30}?)\s*[:-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/g)) {
    const cat = CDT[parseDescription(label)[0]?.candidates[0]?.cdt ?? '']?.category;
    const hit = cat && items.find((i) => !taken.has(i.id) && i.fee === undefined && CDT[i.candidates[0].cdt]?.category === cat);
    if (hit) {
      hit.fee = Number(amount.replace(/,/g, ''));
      taken.add(hit.id);
    }
  }
  return { items, kind: /treatment plan|proposed/i.test(body) ? 'treatment_plan' : 'dentist_note' };
}

const PRACTICE = /\b((?:[A-Z][\w'&-]*\s+){1,3}(?:Dental|Dentistry|Orthodontics|Smiles))\b/;

// --- the agent -----------------------------------------------------------------------------------------------------

export function runLocalAgent(input: AgentInput): AgentOutput {
  const { mail, member, today, contact } = input;
  const web = input.web ?? '';
  const role: ReceivedDoc['role'] = mail.fromDentist ? 'dentist' : 'member';
  const whole = `${mail.subject}\n${mail.text}`;
  const docId = `mail-${hash(`${mail.from}|${whole}`)}`;
  const at = input.at;
  const shifted = (ms: number) => new Date(new Date(at).getTime() + ms).toISOString();
  const to = contact?.email || member.email || (mail.fromDentist ? '' : mail.from) || 'you';
  const detailed = contact?.detail !== 'private';
  const first = member.name.split(/\s+/)[0] || 'there';

  // HIPAA: this is what a language model would be handed. The parsers below read the original, on this device only.
  const known = { names: member.name === 'Member' ? [] : [member.name], ids: [member.memberId] };
  const redacted = redactPhi(whole, known);
  const deidentified = { removed: redacted.removed, preview: redacted.text.slice(0, 600) };
  const base: ReceivedDoc = { docId, receivedAt: at, from: mail.from, role, subject: mail.subject, deidentified };

  const emailsFor = (r: ReturnType<typeof replyEmail>, kind: SentEmail['kind'], ms = 0): SentEmail => ({
    at: shifted(ms),
    kind,
    to,
    subject: r.subject,
    text: r.text,
    html: r.html,
    delivered: 'outbox',
  });

  if (INJECTION.test(whole)) {
    const reply = replyEmail(
      mail.subject,
      {
        docName: 'your message',
        summary: 'This message seems to contain instructions aimed at an AI, so I set it aside without acting on it.',
        found: [],
        did: [],
        flags: [],
        means: [],
        nextSteps: ['If it was a real document from your dentist or insurer, upload it in the app instead.'],
      },
      web,
    );
    return { doc: { ...base, quarantined: true }, procedures: [], deductible: 0, emails: [emailsFor(reply, 'reply')], profile: input.profile };
  }

  let profile = input.profile;
  const plan = profile.currentPlan;
  const recorded: string[] = [];
  const flags: string[] = [];
  const found: string[] = [];
  const nextSteps: string[] = [];
  let record: NonNullable<ReceivedDoc['record']>;
  let docName: string;
  let claim: ClaimEvent | undefined;
  let deductible = 0;
  let fresh: PlannedProcedure[] = [];
  let work: WorkPlan | undefined;
  const { urgent: urgentText, days } = isUrgentText(whole);
  let urgent = false;
  let urgentWhat: string | undefined;

  if (isEobText(whole)) {
    docName = 'an Explanation of Benefits';
    const eob = parseEob(whole);
    const date = eob.serviceDate ?? today;
    const paid = round2(eob.lines.reduce((s, l) => s + l.planPaid, 0));
    const owes = round2(eob.lines.reduce((s, l) => s + l.memberOwes, 0));
    record = {
      docType: 'eob',
      summary: eob.lines.length
        ? `Insurer EOB${eob.claimNumber ? ` ${eob.claimNumber}` : ''}${eob.provider ? ` from ${eob.provider}` : ''}: ${eob.lines.length} service${eob.lines.length === 1 ? '' : 's'} on ${shortDate(date)}. The plan paid ${usd(paid)} and you owe ${usd(owes)}.`
        : "This looks like an Explanation of Benefits, but I couldn't read its service lines.",
      provider: eob.provider,
      serviceDate: eob.serviceDate,
      claimNumber: eob.claimNumber,
      procedures: eob.lines.map((l) => ({ label: cdtLabel(l.cdt, l.tooth), status: 'completed', urgency: 'routine', billed: l.billed, planPaid: l.planPaid, memberOwes: l.memberOwes })),
      amounts: [],
      followUps: [],
    };
    if (eob.lines.length) {
      const ev = eobToClaim(eob, { member: member.memberId, rulesVersion: plan.version, today, fallbackId: `EMAIL-${docId}` });
      const applied = applyEob(profile, ev, round2(eob.lines.reduce((s, l) => s + l.deductible, 0)));
      if (applied.duplicate) recorded.push(`I already had claim ${ev.claimId}, so nothing was counted twice.`);
      else {
        claim = ev;
        deductible = round2(eob.lines.reduce((s, l) => s + l.deductible, 0));
        const before = profile;
        profile = applied.profile;
        recorded.push(
          `Recorded claim ${ev.claimId} on your ledger: the plan paid ${usd(paid)} and you owe ${usd(owes)}.`,
          `Annual maximum used went from ${usd(before.ledger.maxUsed)} to ${usd(profile.ledger.maxUsed)}${deductible ? `; deductible met is now ${usd(profile.ledger.deductibleMet)} of ${usd(plan.deductible.amount)}` : ''}.`,
        );
        if (applied.completed.length) recorded.push(`Marked ${applied.completed.length} planned procedure${applied.completed.length === 1 ? '' : 's'} as done.`);
      }
      found.push(...record.procedures.map((p) => `${p.label}: billed ${usd(p.billed ?? 0)}, plan paid ${usd(p.planPaid ?? 0)}, you owe ${usd(p.memberOwes ?? 0)}`));
    } else nextSteps.push('Send the EOB as text or a clearer photo so I can read the service lines.');
  } else if (isInvoiceText(whole)) {
    docName = "your dentist's bill";
    const inv = parseInvoice(mail.text);
    record = {
      docType: 'dentist_invoice',
      summary: `Dentist's bill${inv.provider ? ` from ${inv.provider}` : ''}${inv.serviceDate ? ` for ${shortDate(inv.serviceDate)}` : ''}${inv.amountDue !== undefined ? ` asking for ${usd(inv.amountDue)}` : ''}.`,
      provider: inv.provider,
      serviceDate: inv.serviceDate,
      procedures: inv.codes.map((c) => ({ label: cdtLabel(c), status: 'completed', urgency: 'routine' })),
      amounts: inv.amountDue !== undefined ? [{ label: 'Amount due', amount: inv.amountDue }] : [],
      followUps: [],
    };
    const claims = claimsFromLedger(profile.ledger.history);
    const d = decideMatch(heuristicMatch(inv, claims));
    const match = d.kind !== 'unlinked' ? claims.find((c) => c.claimId === d.claimId) : undefined;
    const over = match ? overbilling(inv, match) : undefined;
    if (over) flags.push(over.message);
    else if (match) recorded.push(`Matched this bill to claim ${match.claimId}; it agrees with what the EOB says you owe.`);
    else recorded.push("Saved this bill. When your insurer's EOB for the visit arrives, Ting will check the amount against it.");
    if (inv.amountDue !== undefined) found.push(`Amount due: ${usd(inv.amountDue)}`);
  } else {
    const found_ = workIn(mail.text);
    const planned = found_ && found_.items.length;
    docName = found_?.kind === 'treatment_plan' ? 'a treatment plan' : planned ? 'a note from your dentist' : 'your message';
    const provider = PRACTICE.exec(whole)?.[1];
    if (planned) {
      const hedged = (i: IntakeItem) => HEDGED.test(i.phrase);
      const deadline = urgentText ? addDays(today, days ?? 14) : days !== undefined ? addDays(today, days) : undefined;
      const known_ = new Set(profile.procedures.map((p) => `${p.cdt}#${p.tooth ?? ''}`));
      // Fresh ids for this email; a shared visit id follows its first item.
      const ids = new Map(found_.items.map((i, n) => [i.id, `email-${i.candidates[0].cdt}-${i.teeth[0]?.tooth ?? 'x'}-${docId.slice(5, 11)}-${n}`]));
      const idOf = (id: string) => ids.get(id) ?? id;
      const items = found_.items.map((i) => makeItem({ ...i, id: idOf(i.id), visit: i.visit && idOf(i.visit) }));
      const inNetwork = dentists.dentists.find((d) => d.id === member.currentDentistId)?.inNetwork ?? true;
      const likelihood = new Map(found_.items.map((i) => [idOf(i.id), hedged(i) ? 0.5 : undefined]));
      const priced = toProcedures(items, profile).map((p) => {
        // A quote is the dentist's billed fee. What the member pays is the in-network allowance for that code, like
        // any other in-network work: never the full quote.
        const entry = profile.fees[p.cdt];
        const { allowancePending, ...rest } = p;
        const pending = allowancePending && inNetwork && entry?.inNetwork !== undefined;
        // Back-tooth composites are paid at the amalgam rate on plans with the alternate benefit.
        const amalgam = CDT[p.cdt]?.amalgamEquivalent;
        return {
          ...(pending
            ? { ...rest, inNetwork: true, allowedFee: entry.inNetwork, allowedFeeSource: entry.source, ...(amalgam && { alternateAllowedFee: profile.fees[amalgam]?.inNetwork }) }
            : p),
          deadline,
          locked: urgentText || undefined,
          likelihood: likelihood.get(p.id),
          gapDays: p.dependsOn?.length && CDT[p.cdt]?.prepDated ? 14 : undefined,
        };
      });
      fresh = priced.filter((p) => !known_.has(`${p.cdt}#${p.tooth ?? ''}`));
      urgent = urgentText;
      const urgency = urgentText ? 'urgent' : days !== undefined && days <= 90 ? 'soon' : 'routine';
      record = {
        docType: found_.kind,
        summary: `${provider ?? (mail.fromDentist ? 'Your dentist' : 'This email')} ${found_.kind === 'treatment_plan' ? 'proposed' : 'recommends'} ${priced.length} procedure${priced.length === 1 ? '' : 's'}.`,
        provider,
        procedures: priced.map((p) => ({
          label: nameOf(p),
          status: found_.kind === 'treatment_plan' ? 'planned' : 'recommended',
          urgency,
          billed: items.find((i) => i.id === p.id)?.fee,
          deadline,
        })),
        amounts: [],
        followUps: urgentText ? ['Call your dentist to book the first visit now.'] : [],
      };
      if (fresh.length) {
        profile = { ...profile, procedures: [...profile.procedures, ...fresh] };
        try {
          work = planNewWork(profile, fresh.map((f) => f.id), member.currentDentistId);
          recorded.push(`Added ${fresh.length} procedure${fresh.length === 1 ? '' : 's'} to your plan and scheduled ${fresh.length === 1 ? 'it' : 'them'} around your benefits.`);
        } catch (err) {
          profile = { ...profile, procedures: profile.procedures.filter((p) => !fresh.some((f) => f.id === p.id)) };
          flags.push(`Ting couldn't fit the new work into a schedule: ${err instanceof Error ? err.message : String(err)}`);
          fresh = [];
        }
      } else recorded.push('This work is already on your plan, so nothing was added.');
      if (work?.items.length) found.push(...record.procedures.map((p) => `${p.label} (${p.status}${p.billed !== undefined ? `, dentist's quote ${usd(p.billed)}` : ''})`));
      else found.push(...record.procedures.map((p) => `${p.label} (${p.status})`));
      if (urgentText) urgentWhat = `${priced.map(nameOf).join(' and ')}${days !== undefined ? ` within ${days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} days`}` : ' as soon as possible'}`;
    } else if (/\b(coverage|dental plan|benefits)\b/i.test(whole) && /\b(effective|changes?|terminat|premium|enrollment|renew)\b/i.test(whole)) {
      docName = 'a notice about your plan';
      const sentence = mail.text.split(/(?<=[.!?])\s+/).find((s) => /effective|changes?|terminat|premium/i.test(s)) ?? mail.subject;
      record = { docType: 'plan_notice', summary: sentence.trim(), procedures: [], amounts: [], followUps: [] };
      flags.push(`Plan change: ${sentence.trim()}`);
      urgent = urgentText;
      urgentWhat = mail.subject || 'A change to your dental coverage';
      recorded.push('Saved this notice. Compare plans on the Plans page if your coverage is changing.');
    } else {
      record = {
        docType: 'other',
        summary: "I couldn't find a claim, bill or treatment in that email, so I only kept a note of it.",
        procedures: [],
        amounts: [],
        followUps: [],
      };
      nextSteps.push('Paste the text of the EOB, bill or treatment plan into the email, or upload the photo in the app.');
    }
  }

  // What it means: the plan's numbers after this email.
  const means: string[] = [];
  if (plan.kind === 'insurance') {
    means.push(
      `Annual maximum: ${usd(profile.ledger.maxUsed)} used of ${usd(plan.annualMax)}, so ${usd(Math.max(0, round2(plan.annualMax - profile.ledger.maxUsed)))} left this year.`,
      `Deductible: ${usd(profile.ledger.deductibleMet)} of ${usd(plan.deductible.amount)} met.`,
    );
    if (work) {
      if (work.maxThisYear.overBy > 0) means.push(`This year's work needs ${usd(work.maxThisYear.overBy)} more than your annual maximum; Ting moved what it safely could into next year.`);
      else means.push(`Scheduled work this year stays within your ${usd(plan.annualMax)} maximum.`);
      means.push(`Everything on this email: you pay about ${usd(work.items.reduce((s, i) => s + i.memberOwes, 0))} in total.`);
    }
  }

  const doc: ReceivedDoc = {
    ...base,
    urgent,
    urgentP: urgent ? 1 : 0,
    urgentSource: 'rules',
    record,
    recorded,
    flags,
    plan: work && {
      items: work.items.map((i) => ({ label: i.label, date: i.date, memberOwes: i.memberOwes })),
      dentist: work.dentist && { name: work.dentist.name, distanceMiles: work.dentist.distanceMiles, isCurrent: work.dentist.isCurrent },
    },
  };

  // The schedule's questions for the dentist, kept to the work in this email (not the member's other predicted work).
  const questions = (work?.questions ?? []).filter((q) => fresh.some((f) => q.toLowerCase().includes(nameOf(f).toLowerCase())));
  const reply = replyEmail(
    mail.subject,
    { docName, summary: record.summary, found, did: recorded, flags, means, plan: work, urgent: urgent ? urgentWhat : undefined, nextSteps: [...record.followUps, ...nextSteps, ...questions] },
    web,
  );
  const emails = [emailsFor(reply, 'reply')];
  if (urgent && contact?.urgent !== false) {
    const u = urgentEmail(first, urgentWhat ?? record.summary, [record.summary, ...flags], [...record.followUps, ...questions].slice(0, 4), detailed, web);
    emails.push(emailsFor(u, 'urgent', 1));
  }
  return { doc, procedures: fresh, claim, deductible, emails, profile };
}
