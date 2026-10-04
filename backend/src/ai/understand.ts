// Reads an emailed document into a structured record. Claude extracts; tested code decides what is kept: codes must
// be real CDT codes (or are re-derived from the words by the parser), amounts must appear in the document, dates must
// be real dates. Nothing unverified reaches the member's record.
import { CDT, cdtLabel } from '../../../src/engine/cdt';
import { dollarsIn } from '../../../src/engine/explain';
import { parseDescription } from '../../../src/intake/describe';
import { isRec, type CallModel } from './model';

export const DOC_TYPES = [
  'eob',
  'dentist_invoice',
  'dentist_note',
  'treatment_plan',
  'xray_report',
  'plan_notice',
  'fsa_receipt',
  'appointment',
  'other',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface RecordProcedure {
  description: string;
  cdt?: string;
  label: string;
  tooth?: number;
  status: 'completed' | 'planned' | 'recommended';
  urgency: 'routine' | 'soon' | 'urgent';
  serviceDate?: string;
  deadline?: string;
  billed?: number;
  allowed?: number;
  planPaid?: number;
  memberOwes?: number;
}

export interface DocRecord {
  docType: DocType;
  summary: string;
  provider?: string;
  serviceDate?: string;
  claimNumber?: string;
  procedures: RecordProcedure[];
  amounts: { label: string; amount: number }[];
  planChange?: string;
  followUps: string[];
  urgentReason?: string;
}

const SYSTEM = `You read emails and documents a dental patient forwards to their benefits assistant and extract what they say.
Extract only what the text states. Never guess codes, teeth, dates or amounts that are not written.
- docType: eob (insurer's Explanation of Benefits), dentist_invoice (a bill/statement), dentist_note (a dentist's message or note), treatment_plan (proposed work with fees), xray_report (exam/x-ray findings), plan_notice (insurer/employer notice about the plan, premiums, coverage changes), fsa_receipt, appointment, other.
- procedures: every dental procedure mentioned. status completed (already done), planned (scheduled or proposed), recommended (dentist advises). urgency urgent only if the text says immediate/urgent/as soon as possible/emergency; soon if within weeks; else routine.
- billed is the fee quoted or charged for that procedure. Amounts as plain numbers (no $). Dates as YYYY-MM-DD.
- If the text gives a time frame ("within 3 weeks", "in the next month"), set that procedure's deadline to today's date plus that time.
- followUps: concrete next steps the patient should take, in plain words.
- urgentReason: one sentence if anything needs the patient's attention within days (urgent treatment, plan termination or change, payment deadline, denial); otherwise omit.`;

const amount = { type: 'number' };
const TOOL = {
  name: 'document_record',
  description: 'What the document says.',
  schema: {
    type: 'object',
    properties: {
      docType: { type: 'string', enum: [...DOC_TYPES] },
      summary: { type: 'string', description: 'One or two plain sentences.' },
      provider: { type: 'string' },
      serviceDate: { type: 'string' },
      claimNumber: { type: 'string' },
      procedures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            cdt: { type: 'string' },
            tooth: { type: 'integer' },
            status: {
              type: 'string',
              enum: ['completed', 'planned', 'recommended'],
            },
            urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'] },
            serviceDate: { type: 'string' },
            deadline: { type: 'string' },
            billed: amount,
            allowed: amount,
            planPaid: amount,
            memberOwes: amount,
          },
          required: ['description', 'status', 'urgency'],
        },
      },
      amounts: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, amount },
          required: ['label', 'amount'],
        },
      },
      planChange: { type: 'string' },
      followUps: { type: 'array', items: { type: 'string' } },
      urgentReason: { type: 'string' },
    },
    required: ['docType', 'summary', 'procedures', 'amounts', 'followUps'],
  },
};

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const str = (v: unknown, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Keeps only what the source supports. Exported for tests. */
export function validateRecord(raw: unknown, source: string): DocRecord {
  const r = isRec(raw) ? raw : {};
  const seen = new Set(dollarsIn(source).map((n) => Math.round(n * 100)));
  // Amounts are also often written without "$" in tables; accept plain numbers that appear in the text too.
  for (const m of source.matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g)) seen.add(Math.round(Number(m[0].replace(/,/g, '')) * 100));
  const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && seen.has(Math.round(v * 100)) ? v : undefined);
  const procedures: RecordProcedure[] = (Array.isArray(r.procedures) ? r.procedures : [])
    .filter(isRec)
    .slice(0, 20)
    .map((p) => {
      const description = str(p.description, 200) ?? 'dental procedure';
      const tooth = typeof p.tooth === 'number' && p.tooth >= 1 && p.tooth <= 32 ? p.tooth : undefined;
      // The code must be a real one the text supports; otherwise the tested parser reads the description.
      let cdt = typeof p.cdt === 'string' && /^D\d{4}$/.test(p.cdt) && CDT[p.cdt] ? p.cdt : undefined;
      if (!cdt) cdt = parseDescription(`${description}${tooth ? ` #${tooth}` : ''}`)[0]?.candidates[0]?.cdt;
      const status = p.status === 'completed' || p.status === 'planned' || p.status === 'recommended' ? p.status : 'recommended';
      const urgency = p.urgency === 'urgent' || p.urgency === 'soon' ? p.urgency : 'routine';
      return {
        description,
        cdt,
        label: cdt ? cdtLabel(cdt, tooth) : description,
        tooth,
        status,
        urgency,
        serviceDate: isDate(p.serviceDate) ? p.serviceDate : undefined,
        deadline: isDate(p.deadline) ? p.deadline : undefined,
        billed: money(p.billed),
        allowed: money(p.allowed),
        planPaid: money(p.planPaid),
        memberOwes: money(p.memberOwes),
      };
    });
  const docType = DOC_TYPES.includes(r.docType as DocType) ? (r.docType as DocType) : 'other';
  return {
    docType,
    summary: str(r.summary, 400) ?? 'A message about your dental care.',
    provider: str(r.provider, 120),
    serviceDate: isDate(r.serviceDate) ? r.serviceDate : undefined,
    claimNumber: str(r.claimNumber, 60),
    procedures,
    amounts: (Array.isArray(r.amounts) ? r.amounts : [])
      .filter(isRec)
      .map((a) => ({
        label: str(a.label, 80) ?? 'Amount',
        amount: money(a.amount),
      }))
      .filter((a): a is { label: string; amount: number } => a.amount !== undefined)
      .slice(0, 8),
    planChange: str(r.planChange, 300),
    followUps: (Array.isArray(r.followUps) ? r.followUps : [])
      .map((f) => str(f, 200))
      .filter((f): f is string => !!f)
      .slice(0, 5),
    urgentReason: str(r.urgentReason, 300),
  };
}

export async function understand(subject: string, text: string, call: CallModel, today = new Date().toISOString().slice(0, 10)): Promise<DocRecord> {
  const source = `${subject}\n${text}`.slice(0, 40_000);
  const raw = await call({
    model: 'smart',
    system: SYSTEM,
    prompt: `Today's date: ${today}\n<document>\n${source}\n</document>`,
    tool: TOOL,
    maxTokens: 3000,
  });
  return validateRecord(raw, source);
}
