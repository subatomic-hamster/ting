// De-identification before any document text reaches a language model. Direct identifiers from the HIPAA Safe
// Harbor list (names, street addresses, phone and fax numbers, email addresses, SSNs, member/account/claim-holder
// IDs, birth dates) are replaced with typed placeholders. Service dates, CDT codes, tooth numbers and dollar
// amounts stay: the plan math needs them, so this is a limited data set, which in production is covered by the
// carrier's Business Associate Agreement. Ting re-attaches the result to the member by its own record, never by
// what the model read.

export type PhiKind = 'name' | 'address' | 'phone' | 'email' | 'ssn' | 'memberId' | 'birthDate';

export interface Redaction {
  text: string;
  /** How many of each identifier were removed (never the values themselves). */
  removed: Partial<Record<PhiKind, number>>;
}

const LABEL = '[^\\S\\n]*[:#]?[^\\S\\n]*';
const RULES: { kind: PhiKind; re: RegExp; keepLabel?: boolean }[] = [
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: 'phone', re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  {
    kind: 'birthDate',
    re: new RegExp(`\\b(?:DOB|D\\.O\\.B\\.|Date of birth|Birth ?date)${LABEL}[^\\n,;]{4,20}`, 'gi'),
    keepLabel: true,
  },
  {
    kind: 'memberId',
    re: new RegExp(`\\b(?:Member|Subscriber|Patient|Policy ?holder|Insured|Account)(?: ID| No\\.?| Number| #)${LABEL}[A-Z0-9-]{4,}`, 'gi'),
    keepLabel: true,
  },
  {
    kind: 'name',
    re: new RegExp(`\\b(?:Patient(?: name)?|Subscriber(?: name)?|Member(?: name)?|Insured|Dear|Name)${LABEL}(?:(?:Mr|Ms|Mrs|Dr)\\.? )?[A-Z][a-z'’-]+(?: [A-Z]\\.?)?(?: [A-Z][a-z'’-]+)+`, 'g'),
    keepLabel: true,
  },
  {
    kind: 'address',
    re: /\b\d{1,6}(?: [A-Z][a-z]+){1,3} (?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway)\b\.?(?:,? (?:Apt|Suite|Unit|#) ?\w+)?/g,
  },
];

const PLACEHOLDER: Record<PhiKind, string> = {
  name: '[PATIENT NAME]',
  address: '[ADDRESS]',
  phone: '[PHONE]',
  email: '[EMAIL]',
  ssn: '[SSN]',
  memberId: '[MEMBER ID]',
  birthDate: '[BIRTH DATE]',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `known` adds identifiers Ting already holds for this member (their name, member id), wherever they appear. */
export function redactPhi(input: string, known: { names?: string[]; ids?: string[] } = {}): Redaction {
  const removed: Redaction['removed'] = {};
  const count = (kind: PhiKind) => (removed[kind] = (removed[kind] ?? 0) + 1);
  let text = input;
  for (const { kind, re, keepLabel } of RULES)
    text = text.replace(re, (match) => {
      count(kind);
      if (!keepLabel) return PLACEHOLDER[kind];
      const label = /^[^:#]*?[:#]\s*|^\S+(?: \S+)?\s+(?=\S)/.exec(match)?.[0] ?? '';
      // "Patient name Jane Doe" keeps "Patient name"; a bare "Dear Jane" keeps "Dear ".
      return `${label}${PLACEHOLDER[kind]}`;
    });
  for (const id of (known.ids ?? []).filter((s) => s.length >= 4))
    text = text.replace(new RegExp(`\\b${escape(id)}\\b`, 'g'), () => (count('memberId'), PLACEHOLDER.memberId));
  for (const name of (known.names ?? []).filter((s) => s.trim().length >= 2))
    for (const part of [name.trim(), ...name.trim().split(/\s+/).filter((p) => p.length >= 3)])
      text = text.replace(new RegExp(`\\b${escape(part)}\\b`, 'g'), () => (count('name'), PLACEHOLDER.name));
  return { text, removed };
}

export const removedCount = (r: Redaction) => Object.values(r.removed).reduce((s, n) => s + (n ?? 0), 0);

export function describeRemoved(r: Redaction): string {
  const parts = (Object.entries(r.removed) as [PhiKind, number][]).map(([k, n]) => `${n} ${LABELS[k]}${n === 1 ? '' : 's'}`);
  return parts.length ? `Removed before the AI read it: ${parts.join(', ')}.` : 'No direct identifiers found.';
}

const LABELS: Record<PhiKind, string> = {
  name: 'name',
  address: 'street address',
  phone: 'phone number',
  email: 'email address',
  ssn: 'Social Security number',
  memberId: 'member ID',
  birthDate: 'birth date',
};
