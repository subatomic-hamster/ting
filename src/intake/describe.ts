import { isMolar, isPosterior } from '../engine/cdt';
import type { IntakeItem, IntakeSource } from './types';

// Heuristic probabilities (stand-in for Winnow; calibrate on labelled descriptions when it exists):
// - explicit tooth number .98; arch + side + kind names one tooth .9 (first molar assumed, so "lower left
//   back molar" = #19); anything vaguer splits 1 across the teeth it could be (lower back molar: #19 / #30 .5 each).
// - a code the words name outright .8-.95 with the runners-up sharing the rest; no material/size given:
//   porcelain crown .8, composite filling, 2 surfaces .45, deep cleaning D4341 .75, bitewings .6.
// - root canal: code follows the tooth type (molar .93 / premolar .93 / front .93 for D3330 / D3320 / D3310); no tooth: molar .6.
// - "replacing the old one" / "replace my crown" sets replacement to .65.
export const EXPLICIT_TOOTH_P = 0.98;
const SINGLE_TOOTH_P = 0.9;
export const REPLACEMENT_P = 0.65;

type Cands = IntakeItem['candidates'];
type Teeth = IntakeItem['teeth'];

/** Codes billed per tooth. Quadrant and whole-mouth codes (cleanings, deep cleanings, X-rays, exams) don't. */
export const needsTooth = (cdt: string) => /^D[2367]/.test(cdt) || cdt === 'D1351';

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function itemId(source: IntakeSource, text: string, index: number): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return `${source}-${(h >>> 0).toString(36)}-${index}`;
}

export function makeItem(base: Omit<IntakeItem, 'confidence'>): IntakeItem {
  const candidates = [...base.candidates].sort((a, b) => b.p - a.p);
  const teeth = [...base.teeth].sort((a, b) => b.p - a.p);
  const top = candidates[0];
  const toothP = top && needsTooth(top.cdt) ? (teeth[0]?.p ?? 0) : 1;
  return { ...base, candidates, teeth, confidence: round4((top?.p ?? 0) * toothP) };
}

const dist = (top: string, p: number, rest: [string, number][] = []): Cands => [{ cdt: top, p }, ...rest.map(([cdt, q]) => ({ cdt, p: q }))];

const KIND_TEETH = {
  molar: { LL: 19, LR: 30, UL: 14, UR: 3 },
  premolar: { LL: 20, LR: 29, UL: 12, UR: 5 },
  front: { LL: 24, LR: 25, UL: 9, UR: 8 },
  wisdom: { LL: 17, LR: 32, UL: 16, UR: 1 },
};
const QUADS = ['LL', 'LR', 'UL', 'UR'] as const;

function wordTeeth(s: string): Teeth {
  const kind = /wisdom/i.test(s)
    ? 'wisdom'
    : /premolar|bicuspid/i.test(s)
      ? 'premolar'
      : /molar|\bback\b/i.test(s)
        ? 'molar'
        : /front|incisor|canine|cuspid/i.test(s)
          ? 'front'
          : undefined;
  if (!kind) return [];
  const arch = /\b(upper|top|maxillary)\b/i.test(s) ? 'U' : /\b(lower|bottom|mandibular)\b/i.test(s) ? 'L' : undefined;
  const side = /\bleft\b/i.test(s) ? 'L' : /\bright\b/i.test(s) ? 'R' : undefined;
  const quads = QUADS.filter((q) => (!arch || q[0] === arch) && (!side || q[1] === side));
  const p = quads.length === 1 ? SINGLE_TOOTH_P : 1 / quads.length;
  return quads.map((q) => ({ tooth: KIND_TEETH[kind][q], p }));
}

const EXPLICIT = /(?:#|\bteeth\b|\btooth\b(?:\s*(?:number|no\.?|#))?)\s*\d{1,2}(?:\s*(?:,|and|&)\s*#?\d{1,2})*\b/gi;

/** One group per explicitly named tooth (each is its own item); otherwise one group of alternatives, possibly empty. */
function toothGroups(s: string): Teeth[] {
  const nums = [...s.matchAll(EXPLICIT)].flatMap((m) => m[0].match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 32);
  const unique = [...new Set(nums)];
  return unique.length ? unique.map((tooth) => [{ tooth, p: EXPLICIT_TOOTH_P }]) : [wordTeeth(s)];
}

const toothType = (tooth: number) => (isMolar(tooth) ? 'molar' : isPosterior(tooth) ? 'premolar' : 'front');
const ROOT_CANAL = {
  molar: dist('D3330', 0.93, [['D3320', 0.05], ['D3310', 0.01]]),
  premolar: dist('D3320', 0.93, [['D3330', 0.04], ['D3310', 0.02]]),
  front: dist('D3310', 0.93, [['D3320', 0.04], ['D3330', 0.02]]),
};

function rootCanal(teeth: Teeth): Cands {
  if (!teeth.length) return dist('D3330', 0.6, [['D3320', 0.25], ['D3310', 0.14]]);
  const total = teeth.reduce((s, t) => s + t.p, 0);
  const mix = new Map<string, number>();
  for (const t of teeth)
    for (const c of ROOT_CANAL[toothType(t.tooth)]) mix.set(c.cdt, (mix.get(c.cdt) ?? 0) + (c.p * t.p) / total);
  return [...mix].map(([cdt, p]) => ({ cdt, p: round4(p) }));
}

function crown(s: string): Cands {
  if (/\bgold\b/i.test(s)) return dist('D2790', 0.92, [['D2740', 0.04], ['D2750', 0.02]]);
  if (/pfm|porcelain\s+(fused|on)|\bmetal\b/i.test(s)) return dist('D2750', 0.9, [['D2740', 0.07], ['D2790', 0.02]]);
  if (/porcelain|ceramic|zirconia/i.test(s)) return dist('D2740', 0.93, [['D2750', 0.04], ['D2790', 0.01]]);
  return dist('D2740', 0.8, [['D2750', 0.12], ['D2790', 0.04]]);
}

const SURFACES: Record<string, number> = { one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4, five: 5 };

function filling(s: string, teeth: Teeth): Cands {
  if (teeth.length && teeth.every((t) => !isPosterior(t.tooth))) return dist('D2330', 0.9);
  const codes = /amalgam|silver/i.test(s) ? ['D2140', 'D2150', 'D2160', 'D2161'] : ['D2391', 'D2392', 'D2393', 'D2394'];
  const word = /\b(\d|one|single|two|double|three|triple|four|five)[\s-]*(?:surface|sided?)/i.exec(s)?.[1].toLowerCase();
  if (!word) return [{ cdt: codes[1], p: 0.45 }, { cdt: codes[0], p: 0.25 }, { cdt: codes[2], p: 0.2 }, { cdt: codes[3], p: 0.06 }];
  const n = Math.min(Number(word) || SURFACES[word] || 2, 4);
  return codes.flatMap((cdt, i) => (i === n - 1 ? [{ cdt, p: 0.85 }] : Math.abs(i - (n - 1)) === 1 ? [{ cdt, p: 0.05 }] : []));
}

function implant(s: string): Cands[] {
  if (!/\bcrown/i.test(s)) return [dist('D6010', 0.9)];
  const crownOnly = /implant\s+crown|crown\s+(on|for|over)\s+(\w+\s+){0,2}implant/i.test(s);
  return crownOnly ? [dist('D6065', 0.9)] : [dist('D6010', 0.9), dist('D6065', 0.9)];
}

const isMulti = (b: Cands | Cands[]): b is Cands[] => Array.isArray(b[0]);

interface Rule {
  re: RegExp;
  build: (s: string, teeth: Teeth) => Cands | Cands[];
}

// First match wins, so more specific procedures come before the generic words they contain ("deep cleaning" before "cleaning").
const RULES: Rule[] = [
  { re: /\bimplants?\b/i, build: implant },
  { re: /wisdom/i, build: () => dist('D7240', 0.7, [['D7210', 0.2], ['D7140', 0.05]]) },
  { re: /\bbridges?\b/i, build: () => dist('D6750', 0.6, [['D6240', 0.35]]) },
  { re: /root\s*canal|endodontic|\brct\b/i, build: (_s, teeth) => rootCanal(teeth) },
  {
    re: /build[\s-]?up|\bcore\b|\bpost\b/i,
    build: (s) => (/\bpost\b/i.test(s) ? dist('D2954', 0.85, [['D2950', 0.1]]) : dist('D2950', 0.9, [['D2954', 0.05]])),
  },
  { re: /deep\s+clean|scaling|root\s*planing|\bsrp\b|gum\s+(disease\s+)?(clean|treatment)/i, build: () => dist('D4341', 0.75, [['D4342', 0.2]]) },
  { re: /\bcrowns?\b|\bcaps?\b/i, build: crown },
  { re: /dentures?/i, build: (s) => (/partial/i.test(s) ? dist('D5213', 0.85, [['D5110', 0.1]]) : dist('D5110', 0.8, [['D5213', 0.15]])) },
  {
    re: /extract|\bpull(ed)?\b|\bremov/i,
    build: (s) => (/surgical|impacted|broken|snapped|bone/i.test(s) ? dist('D7210', 0.8, [['D7140', 0.15]]) : dist('D7140', 0.65, [['D7210', 0.3]])),
  },
  { re: /night\s*guard|mouth\s*guard|(occlusal|bite)\s+(guard|splint)|\bgrinding\b/i, build: () => dist('D9944', 0.95) },
  { re: /sealants?/i, build: () => dist('D1351', 0.95) },
  { re: /fluoride/i, build: () => dist('D1206', 0.95) },
  {
    re: /x[\s-]?rays?|radiograph|bitewing|panoramic|\bpano\b|\bfmx\b|full[\s-]mouth/i,
    build: (s) =>
      /bitewing/i.test(s)
        ? dist('D0274', 0.9, [['D0210', 0.05]])
        : /panoramic|\bpano\b/i.test(s)
          ? dist('D0330', 0.85, [['D0210', 0.1]])
          : /full[\s-]mouth|\bfmx\b/i.test(s)
            ? dist('D0210', 0.85, [['D0274', 0.1]])
            : dist('D0274', 0.6, [['D0210', 0.35]]),
  },
  {
    re: /\bexams?\b|check[\s-]?ups?|evaluation|consult/i,
    build: (s) =>
      /new patient|comprehensive/i.test(s)
        ? dist('D0150', 0.85, [['D0120', 0.1]])
        : /problem|emergency|toothache/i.test(s)
          ? dist('D0140', 0.75, [['D0120', 0.2]])
          : dist('D0120', 0.8, [['D0150', 0.1], ['D0140', 0.08]]),
  },
  { re: /fillings?|cavit(y|ies)|composite|amalgam|\bsilver\b/i, build: filling },
  { re: /clean|prophy|polish/i, build: () => dist('D1110', 0.93) },
];

const SEPARATOR = /\s*(?:[,;&]|\band\b|\bplus\b|\bthen\b|\balso\b|\bas well as\b)\s*/i;
const REPLACING = /\breplac(e|es|ed|ing|ement)\b|\bre-?do\b|\bold (crown|one)\b|\bexisting crown\b/i;
const CROWN_CODES = new Set(['D2740', 'D2750', 'D2790']);

/** One clause per procedure; a fragment with no procedure ("on #19", "I think it's replacing the old one") stays with the clause before it. */
function clauses(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\b(scaling)\s+and\s+(root)/i, '$1 $2').split(SEPARATOR)) {
    const piece = raw.trim();
    if (!piece) continue;
    if (!RULES.some((r) => r.re.test(piece)) && out.length) out[out.length - 1] += `, ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** Plain English or a voice transcript to candidate codes and teeth, one item per procedure. */
export function parseDescription(text: string, source: IntakeSource = 'text'): IntakeItem[] {
  const whole = toothGroups(text);
  // "root canal and a crown on #19": a clause without its own tooth inherits the one tooth named elsewhere.
  const inherited = whole.length === 1 ? whole[0] : [];
  const items: IntakeItem[] = [];
  for (const clause of clauses(text)) {
    const rule = RULES.find((r) => r.re.test(clause));
    if (!rule) continue;
    const own = toothGroups(clause);
    const groups = own.length === 1 && !own[0].length ? [inherited] : own;
    groups.forEach((teeth, g) => {
      const built = rule.build(clause, teeth);
      for (const candidates of isMulti(built) ? built : [built]) {
        const top = candidates[0].cdt;
        if (g > 0 && !needsTooth(top)) continue;
        items.push(
          makeItem({
            id: itemId(source, text, items.length),
            source,
            phrase: clause,
            candidates,
            teeth: needsTooth(top) ? teeth : [],
            replacement: CROWN_CODES.has(top) && REPLACING.test(clause) ? REPLACEMENT_P : undefined,
          }),
        );
      }
    });
  }
  return items;
}
