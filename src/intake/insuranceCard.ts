/** Demo group number to the plans that group offers (ids from src/data/demo.ts). */
export const GROUP_PLANS: Record<string, string[]> = {
  '00412345': ['acme-low', 'acme-high'],
};

export const plansForGroup = (groupNumber: string): string[] => (Object.hasOwn(GROUP_PLANS, groupNumber) ? GROUP_PLANS[groupNumber] : []);

const CARRIERS: [RegExp, string][] = [
  [/\blincoln\s+(?:financial|dental(?:connect)?)\b/i, 'Lincoln Financial'],
  [/\bdelta\s+dental\b/i, 'Delta Dental'],
  [/\bcigna\b/i, 'Cigna'],
  [/\baetna\b/i, 'Aetna'],
  [/\bmetlife\b/i, 'MetLife'],
  [/\bguardian\b/i, 'Guardian'],
];

// Labelled value that must contain a digit ("Member Name: Jo" is not an ID).
const labelled = (label: string, min: number, max: number) =>
  new RegExp(`\\b(?:${label})\\b(?:\\s*(?:id|number|no\\.?|num|#))*\\s*[:#.\\-]?\\s*((?=[A-Z0-9-]*\\d)[A-Z0-9-]{${min},${max}})`, 'i');
const GROUP = labelled('group|grp', 4, 12);
const MEMBER = labelled('member|subscriber|mbr', 5, 16);

/** OCR reads all-digit group numbers with letters ("OO41I345"); put the digits back. */
const asNumber = (s: string) => (/^[0-9OIl-]+$/i.test(s) ? s.replace(/O/gi, '0').replace(/[Il]/g, '1') : s);

export function parseInsuranceCard(text: string): { groupNumber?: string; memberId?: string; carrier?: string } {
  const group = GROUP.exec(text)?.[1];
  const member = MEMBER.exec(text)?.[1];
  return {
    groupNumber: group && asNumber(group),
    memberId: member,
    carrier: CARRIERS.find(([re]) => re.test(text))?.[1],
  };
}
