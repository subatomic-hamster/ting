import { CDT } from '../engine/cdt';
import { EXPLICIT_TOOTH_P, itemId, makeItem, needsTooth, parseDescription } from './describe';
import type { IntakeItem, IntakeSource } from './types';

/** P that a code printed on the plan is the code the dentist meant (OCR can still misread digits). */
export const LITERAL_CODE_P = 0.97;

const CODE = /\bD[0-9OoIl]{4}\b/gi;
const FEE = /\$\s*\d[\d,]*(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b|\b\d+\.\d{2}\b|\b\d{3,}\b/g;
const HASH_TOOTH = /#\s*([0-9OoIl]{1,2})\b/;
const BARE_TOOTH = /(?<![\d.,$])\b(\d{1,2})\b(?![.,]?\d|\s*(?:surf|canal|quad|%|x\b))/i;
const HEADER = /\b(total|subtotal|patient|insurance|estimate|balance|page|provider|dr\.|date|phone)\b/i;

const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');

/** First token shaped like a code once OCR look-alikes (O/0, I/l/1) are mapped; needs two real digits so words don't qualify. */
function findCode(line: string): { code: string; raw: string } | undefined {
  for (const m of line.matchAll(CODE)) {
    if ((m[0].match(/\d/g) ?? []).length < 2) continue;
    return { code: `D${digits(m[0].slice(1))}`, raw: m[0] };
  }
  return undefined;
}

/** Fee and tooth from what is left of a row after its code is removed. */
function amounts(rest: string): { fee?: number; tooth?: number; text: string } {
  // O for 0 inside numbers: "1,18O.00" -> "1,180.00"
  const fixed = rest.replace(/[\d$,.]+[Oo]+[\d,.Oo]*/g, (m) => m.replace(/[Oo]/g, '0'));
  const fees = [...fixed.matchAll(FEE)];
  const last = fees[fees.length - 1];
  const fee = last ? Number(last[0].replace(/[$,\s]/g, '')) : undefined;
  const text = last ? fixed.replace(last[0], ' ') : fixed;
  const hashed = HASH_TOOTH.exec(text);
  const n = hashed ? Number(digits(hashed[1])) : Number(BARE_TOOTH.exec(text)?.[1]);
  return { fee: fee && fee > 0 ? fee : undefined, tooth: n >= 1 && n <= 32 ? n : undefined, text: text.trim() };
}

/** OCR'd or PDF dentist treatment plan, one procedure per line. Rows whose code isn't in the catalog come back in `unrecognized`. */
export function parseTreatmentPlanText(text: string, source: IntakeSource = 'photo'): { items: IntakeItem[]; unrecognized: string[] } {
  const items: IntakeItem[] = [];
  const unrecognized: string[] = [];
  const add = (item: IntakeItem) => items.push({ ...item, id: itemId(source, text, items.length) });

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|\t]+/g, '  ').trim();
    if (!line) continue;
    const found = findCode(line);
    if (found) {
      if (!CDT[found.code]) {
        unrecognized.push(line);
        continue;
      }
      const { fee, tooth } = amounts(line.replace(found.raw, ' '));
      add(
        makeItem({
          id: '',
          source,
          phrase: line,
          candidates: [{ cdt: found.code, p: LITERAL_CODE_P }],
          teeth: tooth && needsTooth(found.code) ? [{ tooth, p: EXPLICIT_TOOTH_P }] : [],
          fee,
        }),
      );
    } else if (!HEADER.test(line)) {
      const { fee, tooth, text: desc } = amounts(line);
      const parsed = parseDescription(tooth ? `${desc} #${tooth}` : desc, source);
      for (const item of parsed) add({ ...item, phrase: line, fee: parsed.length === 1 ? fee : undefined });
    }
  }
  return { items, unrecognized };
}
