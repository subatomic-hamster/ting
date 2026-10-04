// Answers to typed questions that tested code can give: plan lookups from the rules, costs and dates from the
// engine's schedule. Used when Winnow's router (or the in-browser fallback) says it's that kind of question.
import { parseDescription } from '../intake/describe';
import { nameOf } from './cdt';
import { pct, usd } from './format';
import type { PlannedSchedule } from './schedule';
import type { PlanRules } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

export function planAnswer(question: string, rules: PlanRules): string | undefined {
  const q = question.toLowerCase();
  const c = rules.coinsurance.inNetwork;
  if (/deductible/.test(q)) return `Your ${rules.name} deductible is ${usd(rules.deductible.amount)} a year, for ${rules.deductible.appliesTo.join(' and ')} services.`;
  if (/\bmax|maximum|limit per year|cap\b/.test(q)) return `Your ${rules.name} annual maximum is ${usd(rules.annualMax)} per person.`;
  if (/wait/.test(q))
    return `Waiting periods: basic ${rules.waitingPeriodMonths.basic} months, major ${rules.waitingPeriodMonths.major} months, preventive ${rules.waitingPeriodMonths.preventive} months.`;
  if (/out[- ]of[- ]network|balance bill/.test(q))
    return rules.outOfNetwork.basis === 'ucr'
      ? `Out of network, the plan pays its share of the ${rules.outOfNetwork.percentile}th percentile of usual fees; the dentist can bill you the rest.`
      : 'Out of network, the plan pays its share of a maximum allowable charge; the dentist can bill you the rest.';
  if (/premium/.test(q)) return `The premium is ${usd(rules.premiumMonthly)} a month${rules.premiumPreTax ? ', taken before tax' : ''}.`;
  if (/cover|percent|%|pay for|how much does the plan/.test(q))
    return `In network, the plan pays ${pct(c.preventive)} for preventive, ${pct(c.basic)} for basic and ${pct(c.major)} for major services.`;
  return undefined;
}

export function costAnswer(question: string, schedule: PlannedSchedule): string | undefined {
  const codes = new Set(parseDescription(question).flatMap((i) => i.candidates.slice(0, 2).map((c) => c.cdt)));
  const lines = codes.size ? schedule.lines.filter((l) => codes.has(l.cdt)) : [];
  if (lines.length)
    return lines.map((l) => `${nameOf(l)}: ${date(l.date)}, you pay ${usd(l.memberOwes)}.`).join(' ');
  if (/total|altogether|in all|how much will i pay|how much do i owe/i.test(question))
    return `For everything planned, you pay ${usd(schedule.expectedOwes)} in total.`;
  if (/when|schedule|date/i.test(question) && schedule.lines.length)
    return schedule.lines.map((l) => `${nameOf(l)} on ${date(l.date)}`).join('; ') + '.';
  return undefined;
}

/** In-browser router (the fallback when the API can't be reached): conservative about medical questions. */
export function localIntent(question: string): 'medical_advice' | 'plan_lookup' | 'engine_question' | 'out_of_scope' {
  const q = question.toLowerCase();
  if (/\b(hurt|pain|ache|bleed|swell|infect|should i (get|have)|do i need|is it (bad|serious)|antibiotic|medicine|symptom)/.test(q)) return 'medical_advice';
  if (/deductible|maximum|\bmax\b|wait|network|premium|cover|percent|%/.test(q)) return 'plan_lookup';
  if (/pay|cost|owe|when|schedule|crown|root canal|filling|cleaning|implant|extract/.test(q)) return 'engine_question';
  return 'out_of_scope';
}
