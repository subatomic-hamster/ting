// The email agent: one received email in, the member's record updated, the work planned, a reply in the thread.
// Invoked asynchronously by the webhook (AgentMail) or the demo composer, so the sender never waits on Bedrock.
import { createHash, randomUUID } from 'node:crypto';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import { PERSONAS, type PersonaId } from '../../src/data/personas';
import { planNewWork } from '../../src/engine/agentPlan';
import { CDT } from '../../src/engine/cdt';
import { makeItem } from '../../src/intake/describe';
import { toProcedures } from '../../src/intake/questions';
import { addDays } from '../../src/engine/dates';
import { HEDGED } from '../../src/engine/decisions';
import { usd } from '../../src/engine/format';
import { claimsFromLedger, decideMatch, heuristicMatch, overbilling } from '../../src/engine/reconcile';
import type { PlannedProcedure } from '../../src/engine/types';
import { triageDocument } from './ai/winnow';
import { makeDecide } from './ai/winnowDecide';
import { understand, type DocRecord } from './ai/understand';
import { callBedrock } from './lib/bedrock';
import { getContact, memberByEmail, putDoc, putPlanned } from './lib/corpus';
import { agentAddress, fetchAttachment, fetchMessage, sendEmail } from './lib/email';
import { replyEmail, unknownSenderEmail, urgentEmail } from './lib/emailTemplates';
import { rowsToText } from './lib/layout';
import { memberProfile } from './lib/profile';
import { pushToMember } from './lib/push';

const BUS = process.env.EVENT_BUS ?? '';
const BUCKET = process.env.DOCS_BUCKET ?? '';
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';
const events = new EventBridgeClient({});
const s3 = new S3Client({});
const textract = new TextractClient({});
const { decide } = makeDecide();

export interface InboundEmail {
  messageId?: string;
  from: string;
  subject: string;
  text: string;
  attachments: {
    attachmentId?: string;
    filename?: string;
    contentType?: string;
    text?: string;
  }[];
  /** demo = posted by the in-app composer; replies still go to the sender when email is configured. */
  source: 'agentmail' | 'demo';
}

const address = (from: string) =>
  from
    .replace(/^.*<([^>]+)>.*$/, '$1')
    .trim()
    .toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

async function ocr(bytes: Uint8Array, contentType: string): Promise<string> {
  const key = `uploads/${randomUUID()}/email-attachment`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  const res = await textract.send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: BUCKET, Name: key } },
    }),
  );
  return rowsToText(
    (res.Blocks ?? [])
      .filter((b) => b.BlockType === 'LINE' && b.Text && b.Geometry?.BoundingBox)
      .map((b) => ({
        text: b.Text ?? '',
        top: b.Geometry?.BoundingBox?.Top ?? 0,
        left: b.Geometry?.BoundingBox?.Left ?? 0,
        height: b.Geometry?.BoundingBox?.Height ?? 0,
      })),
  );
}

/** Body plus every attachment's text (AgentMail's extraction for PDFs and documents, Textract for images). */
async function gatherText(mail: InboundEmail): Promise<string> {
  const parts = [mail.text];
  for (const a of mail.attachments.slice(0, 5)) {
    try {
      if (a.text) parts.push(`--- Attachment ${a.filename ?? ''}\n${a.text}`);
      else if (mail.messageId && a.attachmentId) {
        const got = await fetchAttachment(mail.messageId, a.attachmentId);
        if (got.text) parts.push(`--- Attachment ${a.filename ?? ''}\n${got.text}`);
        else if (got.bytes && /^(image\/(png|jpeg|tiff)|application\/pdf)/.test(got.contentType ?? a.contentType ?? ''))
          parts.push(`--- Attachment ${a.filename ?? ''}\n${await ocr(got.bytes, got.contentType ?? a.contentType ?? 'image/png')}`);
      }
    } catch (err) {
      console.warn('attachment skipped', a.filename, err);
    }
  }
  return parts.join('\n\n').slice(0, 40_000);
}

/** Importance: Winnow's probability that it needs attention within days, with Claude's reason as a second signal. */
async function importance(r: DocRecord): Promise<{ urgent: boolean; p: number; source: string }> {
  try {
    const { answers, source } = await decide(
      {
        summary: r.summary,
        docType: r.docType,
        procedures: r.procedures.map((p) => `${p.label} (${p.status}, ${p.urgency})`),
        planChange: r.planChange ?? '',
        note: r.urgentReason ?? '',
      },
      {
        urgent: {
          type: 'noul',
          instructions:
            "Does this need the patient's attention within days, such as urgent or immediate treatment, a coverage termination or plan change, a payment deadline or a denied claim?",
        },
      },
    );
    const p = answers.urgent?.yes ?? 0;
    // Winnow alone over-reads bills ("amount due") as urgent; it decides by itself only when near-certain, otherwise
    // it confirms a signal from the reader.
    const signal = !!r.urgentReason || !!r.planChange || r.procedures.some((x) => x.urgency === 'urgent');
    return { urgent: p >= 0.9 || (signal && p >= 0.3), p, source };
  } catch {
    return {
      urgent: !!r.urgentReason || r.procedures.some((x) => x.urgency === 'urgent'),
      p: -1,
      source: 'fallback',
    };
  }
}

export async function handler(mail: InboundEmail) {
  const from = address(mail.from);
  const who = await memberByEmail(from);
  if (!who) {
    // Only linked addresses are read; everyone else gets a pointer, and nothing is stored.
    if (mail.messageId) {
      const r = unknownSenderEmail(await agentAddress());
      await sendEmail({
        member: 'UNKNOWN',
        kind: 'reply',
        to: from,
        subject: r.subject,
        text: r.text,
        html: r.html,
        inReplyTo: mail.messageId,
      });
    }
    return { ok: false, reason: 'unknown sender' };
  }
  const { member, personaId, role } = who;
  const name = PERSONAS[personaId as PersonaId].name;
  const contact = await getContact(member);
  if (mail.source === 'agentmail' && mail.messageId && !mail.text) {
    const full = await fetchMessage(mail.messageId);
    mail.text = String(full?.text ?? full?.extracted_text ?? '');
  }
  const text = await gatherText(mail);
  const docId = `mail-${createHash('sha256').update(`${from}|${mail.subject}|${text}`).digest('hex').slice(0, 12)}`;

  // Screen before any model reads it.
  const triage = await triageDocument(text, decide).catch(() => undefined);
  if (triage?.quarantined) {
    await putDoc(member, {
      docId,
      source: 'email',
      from,
      subject: mail.subject,
      quarantined: true,
      triage,
    });
    if (role === 'member') {
      const r = replyEmail(
        mail.subject,
        {
          docType: 'other',
          summary: 'This message seems to contain instructions aimed at an AI, so I set it aside without acting on it.',
          procedures: [],
          amounts: [],
          followUps: ['If it was a real document from your dentist or insurer, upload it in the app instead.'],
        },
        { recorded: [], flags: [] },
      );
      await sendEmail({
        member,
        kind: 'reply',
        to: from,
        subject: r.subject,
        text: r.text,
        html: r.html,
        inReplyTo: mail.messageId,
      });
    }
    return { ok: true, quarantined: true };
  }

  const record = await understand(mail.subject, text, callBedrock);
  const recorded: string[] = [];
  const flags: string[] = [];
  let profile = await memberProfile(personaId as PersonaId, today());

  // An EOB's completed lines become a claim on the member's ledger (idempotent per claim number).
  const paid = record.procedures.filter((p) => p.status === 'completed' && p.cdt && p.planPaid !== undefined);
  if (record.docType === 'eob' && paid.length) {
    const lines = paid.map((p) => {
      const memberOwes = p.memberOwes ?? 0;
      const allowed = p.allowed ?? Math.round((p.planPaid! + memberOwes) * 100) / 100;
      return {
        cdt: p.cdt!,
        tooth: p.tooth,
        billed: p.billed ?? allowed,
        allowed,
        planPaid: p.planPaid!,
        memberOwes,
      };
    });
    const claimId = record.claimNumber ?? `EMAIL-${docId}`;
    await events.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: BUS,
            Source: 'ting.email',
            DetailType: 'claim.adjudicated',
            Detail: JSON.stringify({
              type: 'claim.adjudicated',
              member,
              claimId,
              serviceDate: paid[0].serviceDate ?? record.serviceDate ?? today(),
              provider: { npi: 'from-email', inNetwork: true },
              lines,
              rulesVersion: profile.currentPlan.version,
            }),
          },
        ],
      }),
    );
    recorded.push(
      `Recorded claim ${claimId}: the plan paid ${usd(lines.reduce((s, l) => s + l.planPaid, 0))} and you owe ${usd(lines.reduce((s, l) => s + l.memberOwes, 0))}.`,
    );
  }

  // A dentist's bill is checked against Lincoln's EOB for the same visit.
  if (record.docType === 'dentist_invoice') {
    const due = record.amounts.find((a) => /due|balance|owe|pay/i.test(a.label))?.amount ?? record.procedures.reduce((s, p) => s + (p.memberOwes ?? 0), 0);
    const invoice = {
      provider: record.provider,
      serviceDate: record.serviceDate,
      amountDue: due || undefined,
      codes: record.procedures.map((p) => p.cdt).filter((c): c is string => !!c),
      lines: [],
    };
    const claims = claimsFromLedger(profile.ledger.history);
    const d = decideMatch(heuristicMatch(invoice, claims));
    const claim = d.kind !== 'unlinked' ? claims.find((c) => c.claimId === d.claimId) : undefined;
    const over = claim ? overbilling(invoice, claim) : undefined;
    if (over) flags.push(over.message);
    else if (claim) recorded.push(`Matched this bill to claim ${claim.claimId}; it agrees with what the EOB says you owe.`);
    else recorded.push("Saved this bill. When your insurer's EOB for the visit arrives, Ting will check the amount against it.");
  }

  // New or recommended work joins the plan, and the agent schedules it.
  const known = new Set(profile.procedures.map((p) => `${p.cdt}#${p.tooth ?? ''}`));
  const todo = record.procedures.filter((p) => p.status !== 'completed' && p.cdt && !known.has(`${p.cdt}#${p.tooth ?? ''}`));
  // The tested intake path prices the work and orders same-tooth steps (root canal → buildup → crown).
  const items = todo.map((p) =>
    makeItem({
      id: `email-${p.cdt}-${p.tooth ?? 'x'}-${docId.slice(5, 11)}`,
      source: 'upload',
      phrase: p.description,
      candidates: [{ cdt: p.cdt!, p: 1 }],
      teeth: p.tooth ? [{ tooth: p.tooth, p: 1 }] : [],
      fee: p.billed,
    }),
  );
  const fresh: PlannedProcedure[] = toProcedures(items, profile).map((proc) => {
    const p = todo.find((x) => proc.id.startsWith(`email-${x.cdt}-${x.tooth ?? 'x'}-`))!;
    const urgent = p.urgency === 'urgent';
    return {
      ...proc,
      deadline: p.deadline ?? (urgent ? addDays(today(), 14) : p.urgency === 'soon' ? addDays(today(), 60) : undefined),
      locked: urgent || undefined,
      likelihood: HEDGED.test(p.description) ? 0.5 : undefined,
      // A crown is seated on a tooth that has healed from the step before it.
      gapDays: proc.dependsOn?.length && CDT[proc.cdt]?.prepDated ? 14 : undefined,
    };
  });
  for (const proc of fresh) await putPlanned(member, proc, docId);
  let plan;
  if (fresh.length) {
    profile = { ...profile, procedures: [...profile.procedures, ...fresh] };
    try {
      plan = planNewWork(
        profile,
        fresh.map((f) => f.id),
        PERSONAS[personaId as PersonaId].currentDentistId,
      );
      recorded.push(
        `Added ${fresh.length} procedure${fresh.length === 1 ? '' : 's'} to your plan and scheduled ${fresh.length === 1 ? 'it' : 'them'} around your benefits.`,
      );
    } catch (err) {
      flags.push(`Ting couldn't fit the new work into a schedule: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (record.docType === 'plan_notice' && record.planChange) flags.push(`Plan change: ${record.planChange}`);

  const imp = await importance(record);
  const urgentText = imp.urgent ? (record.urgentReason ?? record.procedures.find((p) => p.urgency === 'urgent')?.description ?? record.summary) : undefined;

  await putDoc(member, {
    docId,
    source: 'email',
    from,
    role,
    subject: mail.subject,
    record,
    plan,
    recorded,
    flags,
    urgent: imp.urgent,
    urgentP: imp.p,
    urgentSource: imp.source,
    triage,
  });

  const u = {
    docType: record.docType,
    summary: record.summary,
    provider: record.provider,
    serviceDate: record.serviceDate,
    procedures: record.procedures.map((p) => ({
      label: p.label,
      status: p.status,
      tooth: undefined,
      billed: p.billed,
      planPaid: p.planPaid,
      memberOwes: p.memberOwes,
      urgency: p.urgency,
    })),
    amounts: record.amounts,
    followUps: record.followUps,
  };
  const to = role === 'member' ? from : contact?.email;
  if (role === 'member') {
    const r = replyEmail(mail.subject, u, {
      plan,
      recorded,
      flags,
      urgent: urgentText,
    });
    await sendEmail({
      member,
      kind: 'reply',
      to: from,
      subject: r.subject,
      text: r.text,
      html: r.html,
      inReplyTo: mail.messageId,
    });
  }
  // Something important the member didn't send themselves (their dentist wrote in) gets its own alert.
  if (imp.urgent && role === 'dentist' && to && contact?.urgent !== false) {
    const r = urgentEmail(
      name,
      urgentText ?? 'An update from your dentist',
      [record.summary, ...flags],
      [...record.followUps, ...(plan?.questions ?? [])].slice(0, 4),
      contact?.detail !== 'private',
    );
    await sendEmail({
      member,
      kind: 'urgent',
      to,
      subject: r.subject,
      text: r.text,
      html: r.html,
    });
  }
  if (WS_ENDPOINT)
    await pushToMember(WS_ENDPOINT, member, {
      type: 'corpus.updated',
      docId,
      urgent: imp.urgent,
    });
  return {
    ok: true,
    docId,
    docType: record.docType,
    procedures: record.procedures.length,
    planned: fresh.length,
    urgent: imp.urgent,
    flags: flags.length,
  };
}
