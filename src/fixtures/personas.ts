import type { EngineInput, LedgerEntry, Network, PlanRules, ProcedureItem } from '../contracts';
import { addDays, endOfYear, minDate, yearOf } from '../lib/dates';
import { procedureFromCdt } from './feeSchedule';
import plansJson from './plans.json';

export type PersonaId = 'dale' | 'jordan' | 'priya';

export interface Persona {
  id: PersonaId;
  name: string;
  age: number;
  blurb: string;
  memberId: string;
  employer: string;
  coverage: string;
  currentDentistId: string;
  selectedPlanId: string;
  network: Network;
  marginalTaxRate: number;
  fsa: (year: number) => EngineInput['fsa'];
  ledger: (year: number) => LedgerEntry[];
  /** `today` anchors dentist deadlines so the demo works on any date. */
  procedures: (year: number, today: string) => ProcedureItem[];
}

// Teammates overwrite plans.json with real numbers; the cast keeps this file stable.
export const SAMPLE_PLANS = plansJson as unknown as PlanRules[];

function claim(
  id: string,
  serviceDate: string,
  cdt: string,
  billed: number,
  allowed: number,
  planPaid: number,
  memberOwes: number,
  tooth?: number,
): LedgerEntry {
  return { id, serviceDate, cdt, tooth, billed, allowed, planPaid, memberOwes, source: 'claim', isDemoData: true };
}

const EMPLOYER = 'Acme Manufacturing';

export const PERSONAS: Record<PersonaId, Persona> = {
  dale: {
    id: 'dale',
    name: 'Dale',
    age: 56,
    blurb: 'Root canal, buildup and two crowns quoted in October. $300 of a $1,500 max used.',
    memberId: 'M-10456',
    employer: EMPLOYER,
    coverage: 'Just me',
    currentDentistId: 'd01',
    selectedPlanId: 'high',
    network: 'in',
    marginalTaxRate: 0.22,
    fsa: (year) => ({ balance: 600, forfeitDate: endOfYear(year), rule: 'none' }),
    ledger: (year) => [
      claim('c-dale-1', `${year}-02-12`, 'D0120', 85, 60, 60, 0),
      claim('c-dale-2', `${year}-02-12`, 'D1110', 125, 90, 90, 0),
      claim('c-dale-3', `${year}-08-20`, 'D0120', 85, 60, 60, 0),
      claim('c-dale-4', `${year}-08-20`, 'D0274', 120, 90, 90, 0),
    ],
    procedures: (year, today) => [
      procedureFromCdt('D3330', {
        id: 'p-rc19',
        tooth: 19,
        locked: true,
        deadline: minDate(addDays(today, 14), `${year}-12-15`),
        source: 'photo',
        confidence: 0.97,
      }),
      procedureFromCdt('D2950', { id: 'p-bu19', tooth: 19, dependsOn: ['p-rc19'], source: 'photo', confidence: 0.95 }),
      procedureFromCdt('D2740', { id: 'p-cr19', tooth: 19, dependsOn: ['p-bu19'], source: 'photo', confidence: 0.92 }),
      procedureFromCdt('D2740', { id: 'p-cr30', tooth: 30, source: 'photo', confidence: 0.84 }),
    ],
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    age: 25,
    blurb: "New hire. Ages off a parent's plan in March. Wisdom teeth still in.",
    memberId: 'M-20981',
    employer: EMPLOYER,
    coverage: 'Just me',
    currentDentistId: 'd06',
    selectedPlanId: 'low',
    network: 'in',
    marginalTaxRate: 0.12,
    fsa: (year) => ({ balance: 0, forfeitDate: endOfYear(year), rule: 'carryover' }),
    ledger: (year) => [claim('c-jordan-1', `${year}-04-03`, 'D1110', 125, 90, 90, 0)],
    procedures: () => [
      procedureFromCdt('D7240', { id: 'p-wt17', tooth: 17, source: 'typed', confidence: 0.9 }),
      procedureFromCdt('D7240', { id: 'p-wt32', tooth: 32, source: 'typed', confidence: 0.9 }),
      procedureFromCdt('D0120', { id: 'p-exam', source: 'typed', confidence: 0.98 }),
    ],
  },
  priya: {
    id: 'priya',
    name: 'Priya',
    age: 38,
    blurb: 'Two kids; one likely needs braces. A "maybe" root canal for herself (30%).',
    memberId: 'M-33017',
    employer: EMPLOYER,
    coverage: 'Me + 2 kids',
    currentDentistId: 'd03',
    selectedPlanId: 'low',
    network: 'in',
    marginalTaxRate: 0.22,
    fsa: (year) => ({ balance: 450, forfeitDate: `${year + 1}-03-15`, rule: 'grace' }),
    ledger: (year) => [
      claim('c-priya-1', `${year}-01-22`, 'D1110', 125, 90, 90, 0),
      claim('c-priya-2', `${year}-03-09`, 'D2392', 280, 210, 128, 82, 14),
      claim('c-priya-3', `${year}-07-15`, 'D1110', 125, 90, 90, 0),
    ],
    procedures: () => [
      procedureFromCdt('D1351', { id: 'p-seal', label: 'Sealants (Maya)', source: 'typed', confidence: 0.9 }),
      procedureFromCdt('D8080', { id: 'p-braces', label: 'Braces (Arjun)', likelihood: 0.6, source: 'typed', confidence: 0.85 }),
      procedureFromCdt('D3330', { id: 'p-rc-maybe', tooth: 3, likelihood: 0.3, source: 'typed', confidence: 0.7 }),
    ],
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

/** Everything the engine needs for one persona, anchored at `asOf`. */
export function buildEngineInput(persona: Persona, asOf: string, today: string = asOf): EngineInput {
  const year = yearOf(asOf);
  return {
    plans: SAMPLE_PLANS,
    selectedPlanId: persona.selectedPlanId,
    ledger: persona.ledger(year),
    procedures: persona.procedures(year, today),
    overrides: [],
    network: persona.network,
    asOf,
    fsa: persona.fsa(year),
    marginalTaxRate: persona.marginalTaxRate,
  };
}
