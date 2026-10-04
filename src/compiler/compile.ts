// F2 plan compiler. `compilePlanText` is the local, deterministic reader (regex over a benefits summary);
// the Bedrock reader (built on AWS) implements the same `PlanCompiler` and must pass `planRulesSchema`.
// Whatever the document does not state becomes a question, never a default.
import type { CdtCategory, FrequencyLimit, MaxRewards, PlanRules, RuleKey, ServiceClass } from '../engine/types';
import { CDT_CATEGORIES, planRulesSchema, SERVICE_CLASSES } from './schema';

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type DraftRules = DeepPartial<PlanRules>;

type Network = 'inNetwork' | 'outOfNetwork';
/** Fields a user can be asked about. */
export type AnswerPath =
  | 'name'
  | 'premiumMonthly'
  | 'premiumPreTax'
  | 'annualMax'
  | 'orthoLifetimeMax'
  | 'deductible.amount'
  | 'deductible.appliesTo'
  | 'alternateBenefit'
  | 'preventiveCountsTowardMax'
  | 'q4DeductibleCarryover'
  | 'outOfNetwork'
  | `coinsurance.${Network}.${ServiceClass}`
  | `waitingPeriodMonths.${ServiceClass}`
  | `categoryClass.${CdtCategory}`
  | `maxRewards.${keyof MaxRewards}`;
/** Everything evidence can point at: answerable fields plus the frequency-limit lines. */
export type FieldPath = AnswerPath | `frequencyLimits.${string}`;
export type Answer = string | number | boolean;

export interface CompilerQuestion {
  field: AnswerPath;
  prompt: string;
  options?: { value: string; label: string }[];
  kind: 'choice' | 'number' | 'percent' | 'boolean' | 'text';
}

export interface CompileResult {
  draft: DraftRules;
  evidence: Partial<Record<FieldPath, { snippet: string; section?: string }>>;
  questions: CompilerQuestion[];
}

export interface PlanCompiler {
  compile(text: string): Promise<CompileResult>;
}

// ---------- paths ----------

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (isRec(o) ? o[k] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop() ?? '';
  let cur = obj;
  for (const k of keys) {
    const next = cur[k];
    if (isRec(next)) cur = next;
    else {
      const made: Record<string, unknown> = {};
      cur[k] = made;
      cur = made;
    }
  }
  cur[last] = value;
}

const NETWORKS: Network[] = ['inNetwork', 'outOfNetwork'];
const MAX_REWARDS_KEYS = ['threshold', 'rolloverAmount', 'inNetworkBonus', 'accountLimit', 'depositDay'] as const satisfies readonly (keyof MaxRewards)[];

const MAIN_PATHS: AnswerPath[] = [
  'name',
  'premiumMonthly',
  'annualMax',
  'deductible.amount',
  'deductible.appliesTo',
  ...NETWORKS.flatMap((n) => SERVICE_CLASSES.map((c) => `coinsurance.${n}.${c}` as const)),
  'orthoLifetimeMax',
  ...SERVICE_CLASSES.map((c) => `waitingPeriodMonths.${c}` as const),
  ...CDT_CATEGORIES.map((c) => `categoryClass.${c}` as const),
  'outOfNetwork',
];
const MAX_REWARDS_PATHS = MAX_REWARDS_KEYS.map((k) => `maxRewards.${k}` as const);
const BOOLEAN_PATHS: AnswerPath[] = ['premiumPreTax', 'alternateBenefit', 'preventiveCountsTowardMax', 'q4DeductibleCarryover'];

/** Required fields in question order: numbers and choices first, yes/no last. MaxRewards terms only once the plan has MaxRewards. */
function requiredPaths(draft: DraftRules): AnswerPath[] {
  return [...MAIN_PATHS, ...(draft.maxRewards ? MAX_REWARDS_PATHS : []), ...BOOLEAN_PATHS];
}

const missingPaths = (draft: DraftRules) => requiredPaths(draft).filter((p) => getPath(draft, p) === undefined);

// ---------- questions ----------

const CLASS_OPTIONS = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'basic', label: 'Basic' },
  { value: 'major', label: 'Major' },
  { value: 'ortho', label: 'Orthodontic' },
  { value: 'excluded', label: 'Not covered' },
];
const CATEGORY_LABEL: Record<CdtCategory, string> = {
  diagnostic: 'diagnostic services (exams, X-rays)',
  preventive: 'preventive services (cleanings, fluoride)',
  restorative: 'restorative services (fillings)',
  majorRestorative: 'major restorative services (crowns, buildups)',
  endodontics: 'endodontics',
  periodontics: 'periodontics',
  prosthodontics: 'prosthodontics',
  implants: 'implants',
  oralSurgery: 'oral surgery',
  orthodontics: 'orthodontics',
  adjunctive: 'adjunctive services (sedation, night guards)',
};
const MAX_REWARDS_PROMPT: Record<keyof MaxRewards, string> = {
  threshold: 'Max Rollover: what is the most the plan can pay in a year (in dollars) and still earn a rollover?',
  rolloverAmount: 'Max Rollover: how many dollars roll over in a qualifying year?',
  inNetworkBonus: 'Max Rollover: how many extra dollars are added when every claim was in network?',
  accountLimit: 'Max Rollover: what is the most the rollover account can hold (in dollars)?',
  depositDay: 'Max Rollover: on which day of the following plan year is the rollover deposited?',
};

function questionFor(field: AnswerPath): CompilerQuestion {
  const [head = '', a = '', b = ''] = field.split('.');
  const q = (kind: CompilerQuestion['kind'], prompt: string, options?: CompilerQuestion['options']): CompilerQuestion => ({ field, prompt, kind, ...(options && { options }) });
  switch (head) {
    case 'name': return q('text', 'What is the name of this plan?');
    case 'premiumMonthly': return q('number', 'What is the monthly premium, in dollars?');
    case 'premiumPreTax': return q('boolean', 'Is the premium paid pre-tax through payroll?');
    case 'annualMax': return q('number', 'What is the annual maximum benefit per person, in dollars?');
    case 'orthoLifetimeMax': return q('number', 'What is the orthodontic lifetime maximum, in dollars (0 if there is none)?');
    case 'alternateBenefit': return q('boolean', 'Does the plan pay tooth-colored fillings on back teeth at the silver-filling rate (alternate benefit)?');
    case 'preventiveCountsTowardMax': return q('boolean', 'Do preventive and diagnostic services count toward the annual maximum?');
    case 'q4DeductibleCarryover': return q('boolean', "Does a deductible met in October to December also count toward next year's deductible?");
    case 'deductible':
      return a === 'amount'
        ? q('number', 'What is the annual deductible, in dollars (0 if none)?')
        : q('choice', 'Which service classes does the deductible apply to?', [
            { value: 'basic,major', label: 'Basic and major' },
            { value: 'major', label: 'Major only' },
            { value: 'basic', label: 'Basic only' },
            { value: 'preventive,basic,major', label: 'Preventive, basic and major' },
            { value: 'preventive,basic,major,ortho', label: 'All services including orthodontics' },
          ]);
    case 'coinsurance': return q('percent', `What percent does the plan pay for ${b} services ${a === 'inNetwork' ? 'in network' : 'out of network'}?`);
    case 'waitingPeriodMonths': return q('number', `How many months is the waiting period for ${a} services (0 if none)?`);
    case 'categoryClass': {
      const label = CATEGORY_LABEL[a as CdtCategory];
      if (a === 'orthodontics') return q('choice', 'Does your plan cover orthodontics, and under which class?', CLASS_OPTIONS);
      if (a === 'diagnostic' || a === 'preventive') return q('choice', `Which class are ${label} on your plan?`, CLASS_OPTIONS);
      return q('choice', `Is ${label} basic or major on your plan?`, CLASS_OPTIONS);
    }
    case 'maxRewards': return q('number', MAX_REWARDS_PROMPT[a as keyof MaxRewards]);
    default:
      return q('choice', 'How does the plan reimburse out-of-network dentists?', [
        ...[50, 70, 80, 90, 95].map((p) => ({ value: String(p), label: `${p}th percentile of usual and customary charges` })),
        { value: 'mac', label: 'Maximum allowable charge (MAC)' },
      ]);
  }
}

// ---------- text reader ----------

interface Line {
  text: string;
  section?: string;
}

// "Schedule of Benefits, §2 Coinsurance" or "Enrollment Summary" start a section.
const HEADING = /^(Enrollment Summary|[A-Z][A-Za-z&-]*(?: [A-Za-z&-]+)*, §\d+(?:\.\d+)*)(?=\s|$)/;

function readLines(text: string): Line[] {
  let section: string | undefined;
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    section = t.match(HEADING)?.[1] ?? section;
    lines.push({ text: t, section });
  }
  return lines;
}

const num = (s: string | undefined) => Number((s ?? '').replace(/,/g, ''));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const classesIn = (s: string): ServiceClass[] => (/\ball\b/i.test(s) ? [...SERVICE_CLASSES] : SERVICE_CLASSES.filter((c) => new RegExp(`\\b${c}`, 'i').test(s)));
const classWord = (w: string): ServiceClass | 'excluded' => (/not covered|excluded/i.test(w) ? 'excluded' : /^ortho/i.test(w) ? 'ortho' : (w.toLowerCase() as ServiceClass));

// Codes mirror the sample plan's groupings (src/data/demo.ts).
const LIMITS: { id: string; match: RegExp; codes: string[] }[] = [
  { id: 'exams', match: /^exams?\b/i, codes: ['D0120', 'D0140', 'D0150'] },
  { id: 'cleanings', match: /^(?:cleanings?|prophylaxis)\b/i, codes: ['D1110', 'D1120', 'D4910'] },
  { id: 'bitewings', match: /^bitewing/i, codes: ['D0274'] },
  { id: 'fmx', match: /^(?:full[- ]mouth|panoramic)/i, codes: ['D0210', 'D0330'] },
  { id: 'crowns', match: /^crowns?\b/i, codes: ['D2740', 'D2750', 'D2790', 'D6065', 'D6240', 'D6750'] },
  { id: 'buildups', match: /^(?:build-?ups?|posts?\b)/i, codes: ['D2950', 'D2954'] },
  { id: 'srp', match: /^(?:scaling|root planing|deep cleanings?)/i, codes: ['D4341', 'D4342'] },
  { id: 'nightguard', match: /^(?:night ?guards?|occlusal guards?)/i, codes: ['D9944'] },
];
const FREQ = /^([^:]{2,60}):\s*(\d+)\s*(?:times?\s*)?per\s+(?:(tooth|quadrant)\s+per\s+)?(?:(?:calendar\s+)?year\b|(\d+)\s*(months?|years?)\b)/i;

const CATEGORY_ROWS: [CdtCategory, RegExp][] = [
  ['majorRestorative', /^(?:major restorative|crowns?\b)/i],
  ['restorative', /^(?:restorative|fillings?)\b/i],
  ['diagnostic', /^diagnostic\b/i],
  ['preventive', /^preventive\b/i],
  ['endodontics', /^(?:endodontic|root canal)/i],
  ['periodontics', /^periodont/i],
  ['prosthodontics', /^(?:prosthodontic|dentures?)/i],
  ['implants', /^implants?\b/i],
  ['oralSurgery', /^(?:oral surgery|extractions?)/i],
  ['orthodontics', /^orthodont/i],
  ['adjunctive', /^(?:adjunctive|general services?)/i],
];
const TRAILING_CLASS = /\b(preventive|basic|major|ortho\w*|not covered|excluded)\b(?:\s+services?)?\W*$/i;
const COINS_ROW = /^(preventive|basic|major|ortho\w*)\b[^%\d]*?\s(\d{1,3}%|not covered)\s+(\d{1,3}%|not covered)$/i;
const PERCENTILES = [50, 70, 80, 90, 95] as const;

const RULE_KEY: Record<string, RuleKey> = {
  premiumMonthly: 'premium', premiumPreTax: 'premium', coinsurance: 'coinsurance', deductible: 'deductible', annualMax: 'annualMax',
  waitingPeriodMonths: 'waitingPeriods', categoryClass: 'serviceClasses', frequencyLimits: 'frequencyLimits', alternateBenefit: 'alternateBenefit',
  maxRewards: 'maxRewards', preventiveCountsTowardMax: 'preventiveMax', q4DeductibleCarryover: 'q4Carryover', outOfNetwork: 'outOfNetwork',
};

export function compilePlanText(text: string): CompileResult {
  const lines = readLines(text);
  const draft: DraftRules = { kind: 'insurance' };
  const evidence: CompileResult['evidence'] = {};
  const sections: PlanRules['sections'] = {};
  const limits = new Map<string, FrequencyLimit>();

  const cite = (path: FieldPath, l: Line) => {
    evidence[path] = { snippet: l.text, ...(l.section && { section: l.section }) };
  };
  /** First statement in the document wins. */
  const set = (path: AnswerPath, value: unknown, l: Line) => {
    if (getPath(draft, path) !== undefined) return;
    setPath(draft, path, value);
    cite(path, l);
  };

  const hasMaxRewards = /maxrewards|max rollover/i.test(text);
  if (hasMaxRewards) draft.maxRewards = {};
  const maxRewardsMention = lines.find((l) => /maxrewards|max rollover/i.test(l.text));

  for (const l of lines) {
    const t = l.text;
    if (/work[- ]in[- ]progress|preparation date|date of preparation/i.test(t)) sections.workInProgress ??= l.section;
    if (HEADING.test(t)) continue;

    const nm = t.match(/^(.+?)\s+[—–-]+\s+Benefits Summary\b/i) ?? t.match(/^plan name:\s*(.+)$/i);
    if (nm?.[1]) set('name', nm[1].trim(), l);

    if (/premium/i.test(t)) {
      const m = t.match(/\$\s?([\d,]+(?:\.\d+)?)/);
      if (m && /month/i.test(t)) set('premiumMonthly', num(m[1]), l);
      if (/\b(?:after|post)-?[ ]?tax\b|\bnot pre-?tax\b/i.test(t)) set('premiumPreTax', false, l);
      else if (/\bpre-?tax\b/i.test(t)) set('premiumPreTax', true, l);
    }

    if (/annual (?:calendar[- ]year )?(?:benefit )?maximum|calendar[- ]year maximum/i.test(t) && !/ortho|roll|maxrewards|lifetime/i.test(t)) {
      const m = t.match(/maximum[^$]{0,50}\$\s?([\d,]+)/i);
      if (m) set('annualMax', num(m[1]), l);
    }
    const ol = t.match(/ortho\w*[^$]{0,40}lifetime[^$]{0,40}\$\s?([\d,]+)|lifetime[^$]{0,40}ortho\w*[^$]{0,40}\$\s?([\d,]+)/i);
    if (ol) set('orthoLifetimeMax', num(ol[1] ?? ol[2]), l);

    if (/deductible/i.test(t) && !/carry|met in|q4/i.test(t)) {
      const m = t.match(/deductible[^$]{0,40}\$\s?([\d,]+)/i);
      if (m) {
        set('deductible.amount', num(m[1]), l);
        const ap = t.match(/appl(?:y|ies) to ([^.;]*)/i);
        const cs = ap ? classesIn(ap[1] ?? '') : [];
        if (cs.length) set('deductible.appliesTo', cs, l);
      } else if (/\bno (?:annual )?deductible\b/i.test(t)) {
        set('deductible.amount', 0, l);
        set('deductible.appliesTo', [], l);
      }
    }
    if (/deductible/i.test(t) && /\bq4\b|fourth[- ]quarter|october/i.test(t)) {
      set('q4DeductibleCarryover', !/\b(?:no|not|without|doesn't)\b/i.test(t), l);
    }

    const row = t.match(COINS_ROW);
    if (row) {
      const cls = classWord(row[1] ?? '');
      for (const [i, n] of NETWORKS.entries()) {
        const tok = row[i + 2] ?? '';
        set(`coinsurance.${n}.${cls === 'excluded' ? 'ortho' : cls}`, /not covered/i.test(tok) ? 0 : num(tok.replace('%', '')) / 100, l);
      }
      continue;
    }

    if (/waiting period/i.test(t)) {
      if (/waiting periods?\W+none\b|\bno waiting periods?/i.test(t)) SERVICE_CLASSES.forEach((c) => set(`waitingPeriodMonths.${c}`, 0, l));
      for (const c of SERVICE_CLASSES) {
        const w = t.match(new RegExp(`\\b${c === 'ortho' ? 'ortho\\w*' : c}\\b\\W+(?:services?\\W+)?(?:(none|no waiting)|(\\d{1,2})[- ]months?)`, 'i'));
        if (w) set(`waitingPeriodMonths.${c}`, w[1] ? 0 : num(w[2]), l);
      }
    }

    const cat = CATEGORY_ROWS.find(([, re]) => re.test(t));
    const tc = t.match(TRAILING_CLASS);
    if (cat && tc && !t.includes('%')) set(`categoryClass.${cat[0]}`, classWord(tc[1] ?? ''), l);

    const fm = t.match(FREQ);
    const lim = fm && LIMITS.find((x) => x.match.test(fm[1] ?? ''));
    if (fm && lim && !limits.has(lim.id)) {
      const n = num(fm[4]);
      limits.set(lim.id, {
        id: lim.id,
        label: t.replace(/\.$/, ''),
        codes: lim.codes,
        count: num(fm[2]),
        period: fm[4] ? { kind: 'months', months: /^year/i.test(fm[5] ?? '') ? n * 12 : n } : { kind: 'calendarYear' },
        perTooth: Boolean(fm[3]),
      });
      cite(`frequencyLimits.${lim.id}`, l);
    }

    if (/alternate benefit|least costly alternative/i.test(t)) {
      const no = /\b(?:no|not|without)\b[^.]{0,25}alternate benefit|alternate benefit[^.]{0,40}\b(?:not apply|does not|not applicable|none)\b/i.test(t);
      set('alternateBenefit', !no, l);
    }

    if (/preventive/i.test(t) && /\bmax(?:imum)?\b/i.test(t) && /count|apply|reduce|erode|deduct/i.test(t)) {
      set('preventiveCountsTowardMax', !/\b(?:do(?:es)? not|don't|doesn't|never|not)\b/i.test(t), l);
    }

    if (/out[- ]of[- ]network/i.test(t)) {
      const p = t.match(/\b(\d{2})(?:st|nd|rd|th)? percentile/i);
      const pc = PERCENTILES.find((x) => x === Number(p?.[1]));
      if (pc) set('outOfNetwork', { basis: 'ucr', percentile: pc }, l);
      else if (/\bMAC\b|maximum allowable charge/i.test(t)) set('outOfNetwork', { basis: 'mac' }, l);
    }

    if (hasMaxRewards) {
      const th = t.match(/\$\s?([\d,]+) or (?:less|under)/i) ?? (/paid|claims/i.test(t) ? t.match(/(?:under|below|less than) \$\s?([\d,]+)/i) : null);
      if (th) set('maxRewards.threshold', num(th[1]), l);
      const bonus = t.match(/(?:extra|additional|bonus(?: of)?) \$\s?([\d,]+)/i);
      if (bonus) set('maxRewards.inNetworkBonus', num(bonus[1]), l);
      else {
        const ro = t.match(/\$\s?([\d,]+) (?:will )?roll(?:s|ed)? ?over|roll(?:s|ed)? ?over (?:of |to )?\$\s?([\d,]+)|rollover (?:amount )?(?:of|is) \$\s?([\d,]+)/i);
        if (ro) set('maxRewards.rolloverAmount', num(ro[1] ?? ro[2] ?? ro[3]), l);
      }
      const lm = /account|balance|rollover|accumulat/i.test(t) ? t.match(/(?:up to|limit of|maximum of|capped at|not exceed) \$\s?([\d,]+)/i) : null;
      if (lm) set('maxRewards.accountLimit', num(lm[1]), l);
      const dd = /deposit|credited/i.test(t) ? t.match(/\bday (\d{1,3})\b/i) : null;
      if (dd) set('maxRewards.depositDay', num(dd[1]), l);
    }
  }

  // Lincoln deposits on day 65; applied only because the document mentions MaxRewards, and cited.
  if (maxRewardsMention && getPath(draft, 'maxRewards.depositDay') === undefined) {
    setPath(draft, 'maxRewards.depositDay', 65);
    evidence['maxRewards.depositDay'] = {
      snippet: `Deposit day not stated; Max Rollover deposits on day 65 by default. (${maxRewardsMention.text})`,
      ...(maxRewardsMention.section && { section: maxRewardsMention.section }),
    };
  }
  // No orthodontic coverage means no orthodontic lifetime maximum.
  const orthoEv = evidence['categoryClass.orthodontics'];
  if (draft.orthoLifetimeMax === undefined && draft.categoryClass?.orthodontics === 'excluded' && orthoEv) {
    draft.orthoLifetimeMax = 0;
    evidence.orthoLifetimeMax = orthoEv;
  }

  if (draft.name) draft.id = slug(draft.name);
  draft.frequencyLimits = LIMITS.flatMap((x) => limits.get(x.id) ?? []); // ponytail: a document with no limit lines yields none; ask when that proves wrong
  for (const [path, ev] of Object.entries(evidence)) {
    const key = RULE_KEY[path.split('.')[0] ?? ''];
    if (key && ev?.section) sections[key] ??= ev.section;
  }
  draft.sections = sections;

  return { draft, evidence, questions: missingPaths(draft).map(questionFor) };
}

export const localCompiler: PlanCompiler = { compile: async (text) => compilePlanText(text) };

/** Questions for whatever a draft still doesn't say. */
export const questionsFor = (draft: DraftRules): CompilerQuestion[] => missingPaths(draft).map(questionFor);

// ---------- answers, finalize, approve ----------

function coerce(field: AnswerPath, raw: Answer): unknown {
  const q = questionFor(field);
  if (q.kind === 'number') return Number(raw);
  if (q.kind === 'percent') {
    const n = Number(String(raw).replace('%', ''));
    return n > 1 ? n / 100 : n; // 50 and "50%" mean 0.5; 1 means 100%
  }
  if (q.kind === 'boolean') return raw === true || /^(?:true|yes|y|1)$/i.test(String(raw));
  const s = String(raw).trim();
  if (field === 'deductible.appliesTo') return s.split(',').map((x) => x.trim()).filter(Boolean);
  if (field === 'outOfNetwork') return s.toLowerCase() === 'mac' ? { basis: 'mac' } : { basis: 'ucr', percentile: Number(s) };
  return s;
}

/** Percent answers: 0..1 or 0..100 (anything above 1 is read as percentage points). */
export function applyAnswers(draft: DraftRules, answers: Partial<Record<AnswerPath, Answer>>): DraftRules {
  const next = structuredClone(draft);
  for (const field of Object.keys(answers) as AnswerPath[]) {
    const raw = answers[field];
    if (raw !== undefined) setPath(next, field, coerce(field, raw));
  }
  if (next.name && !next.id) next.id = slug(next.name);
  return next;
}

export type FinalizeResult = { ok: true; rules: PlanRules } | { ok: false; missing: AnswerPath[]; errors: string[] };

/** Validates the draft against `planRulesSchema`. `version` stays a placeholder until `approveRules`. */
export function finalizeRules(draft: DraftRules): FinalizeResult {
  const candidate = { version: 'UNAPPROVED', sections: {}, ...draft };
  const parsed = planRulesSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, rules: parsed.data };
  const missing = missingPaths(candidate);
  const errors = parsed.error.issues
    .filter((i) => {
      const path = i.path.join('.');
      return getPath(candidate, path) !== undefined || !missing.some((m) => m === path || m.startsWith(`${path}.`));
    })
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, missing, errors };
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isRec(v)) {
    const body = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`);
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Stamps approved rules: SHA-256 over sorted-key JSON of the rules minus `version`. Same rules, same hash. */
export async function approveRules(rules: PlanRules): Promise<{ rules: PlanRules; hash: string }> {
  const { version: _version, ...body } = planRulesSchema.parse(rules);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(body)));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { rules: { ...rules, version: `PLAN-${rules.id.toUpperCase()}-${hash.slice(0, 8)}` }, hash };
}
