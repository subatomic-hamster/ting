import { round2 } from '../engine/adjudicate';
import { cdtLabel } from '../engine/cdt';
import { addMonths } from '../engine/dates';
import { usd } from '../engine/format';
import { evaluateSchedule } from '../engine/schedule';
import type { PlannedProcedure, Profile, ServiceRecord } from '../engine/types';
import type { IntakeItem, IntakeQuestion } from './types';

/** Ask only when guessing wrong costs more than this in expectation; below it the answer is accepted as "inferred". */
export const ASK_THRESHOLD = 25;
const REPLACED_MONTHS_AGO = 36;

/** Top answer of each item as a planned procedure. Items with no known fee can't be priced and are left out. */
export function toProcedures(items: IntakeItem[], profile: Profile): PlannedProcedure[] {
  return items.flatMap((item) => {
    const cdt = item.candidates[0]?.cdt;
    if (!cdt) return [];
    const table = profile.fees[cdt];
    const fee = item.fee ?? table?.billed;
    if (fee === undefined) return [];
    return [{ id: item.id, cdt, tooth: item.teeth[0]?.tooth, fee, allowedFee: table?.inNetwork, inNetwork: true }];
  });
}

/** What the member owes per item if all of them happen today; `replacing` items get a same-code crown placed 3 years ago on their tooth. */
function owesToday(items: IntakeItem[], profile: Profile, replacing: ReadonlySet<string>): Map<string, number> {
  const procedures = toProcedures(items, profile);
  const date = addMonths(profile.asOf, -REPLACED_MONTHS_AGO);
  const replaced: ServiceRecord[] = procedures
    .filter((p) => replacing.has(p.id))
    .map((p) => ({ date, cdt: p.cdt, tooth: p.tooth, planPaid: 0, source: 'user' }));
  const priced: Profile = { ...profile, procedures, ledger: { ...profile.ledger, history: [...profile.ledger.history, ...replaced] } };
  const ev = evaluateSchedule(priced, procedures.map((p) => ({ id: p.id, date: profile.asOf })));
  return new Map(ev.lines.map((l) => [l.id, l.memberOwes]));
}

interface Answer {
  value: string;
  label: string;
  /** Finishes "If ... instead you'd pay". */
  phrase: string;
  p: number;
  items: IntakeItem[];
  replacing: ReadonlySet<string>;
}

/**
 * Value of information: reprice each uncertain field of each item under every answer, using the engine's own bill.
 * expected cost of guessing = sum over answers a other than the top of p(a) * |owe(a) - owe(top)|.
 * Option probabilities are normalised over the listed answers.
 */
export function intakeQuestions(items: IntakeItem[], profile: Profile): IntakeQuestion[] {
  const replacingNow = new Set(items.filter((i) => (i.replacement ?? 0) >= 0.5).map((i) => i.id));
  const out: IntakeQuestion[] = [];

  for (const item of items) {
    const swap = (v: IntakeItem) => items.map((i) => (i.id === item.id ? v : i));
    const share = (ps: number[]) => ps.map((p) => p / (ps.reduce((s, q) => s + q, 0) || 1));
    const fields: { field: IntakeQuestion['field']; prompt: string; answers: Answer[] }[] = [];

    if (item.candidates.length > 1) {
      const ps = share(item.candidates.map((c) => c.p));
      fields.push({
        field: 'cdt',
        prompt: `Which procedure is "${item.phrase}"?`,
        answers: item.candidates.map((c, i) => ({
          value: c.cdt,
          label: cdtLabel(c.cdt),
          phrase: `it's ${cdtLabel(c.cdt)}`,
          p: ps[i],
          // The stated fee belongs to the top code only.
          items: swap({ ...item, candidates: [{ cdt: c.cdt, p: 1 }], fee: i === 0 ? item.fee : undefined }),
          replacing: replacingNow,
        })),
      });
    }
    if (item.teeth.length > 1) {
      const ps = share(item.teeth.map((t) => t.p));
      fields.push({
        field: 'tooth',
        prompt: `Which tooth is "${item.phrase}" about?`,
        answers: item.teeth.map((t, i) => ({
          value: String(t.tooth),
          label: `Tooth #${t.tooth}`,
          phrase: `it's tooth #${t.tooth}`,
          p: ps[i],
          items: swap({ ...item, teeth: [{ tooth: t.tooth, p: 1 }] }),
          replacing: replacingNow,
        })),
      });
    }
    if (item.replacement !== undefined) {
      const yes = new Set(replacingNow).add(item.id);
      const no = new Set(replacingNow);
      no.delete(item.id);
      fields.push({
        field: 'replacement',
        prompt: 'Is this crown replacing one you already have?',
        answers: [
          { value: 'yes', label: 'Yes, replacing an old crown', phrase: 'it replaces an existing crown', p: item.replacement, items, replacing: yes },
          { value: 'no', label: 'No, not replacing one', phrase: "it doesn't replace an existing crown", p: 1 - item.replacement, items, replacing: no },
        ],
      });
    }

    for (const { field, prompt, answers } of fields) {
      const priced = answers.map((a) => ({ a, owes: owesToday(a.items, profile, a.replacing).get(item.id) }));
      if (priced.some((x) => x.owes === undefined)) continue;
      const rows = priced.map((x) => ({ a: x.a, owes: x.owes ?? 0 }));
      const top = rows.reduce((best, r) => (r.a.p > best.a.p ? r : best));
      const alts = rows.filter((r) => r !== top);
      const cost = round2(alts.reduce((s, r) => s + r.a.p * Math.abs(r.owes - top.owes), 0));
      if (cost <= ASK_THRESHOLD) continue;
      const worst = alts.reduce((best, r) => (Math.abs(r.owes - top.owes) > Math.abs(best.owes - top.owes) ? r : best));
      const delta = round2(worst.owes - top.owes);
      out.push({
        itemId: item.id,
        field,
        prompt,
        why: `If ${worst.a.phrase} instead you'd pay ${usd(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'}.`,
        options: rows.map((r) => ({ value: r.a.value, label: r.a.label, p: r.a.p, owes: r.owes })),
        preselected: top.a.value,
        expectedCostOfGuessing: cost,
      });
    }
  }
  return out;
}
