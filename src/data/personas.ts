// Demo members, anchored to "today" so deadlines and plan years work on any date. Labelled demo data on screen.
import { DEMO_FEES } from '../engine/cdt';
import { addDays, yearOf } from '../engine/dates';
import type { ISODate, PlannedProcedure, Profile } from '../engine/types';
import { ACME_LOW, DEMO_PROFILE } from './demo';

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
  profile: (asOf: ISODate) => Profile;
}

/** In-network demo fees for a code. */
function proc(id: string, cdt: string, extra: Partial<PlannedProcedure> = {}): PlannedProcedure {
  return { id, cdt, fee: DEMO_FEES[cdt].billed, allowedFee: DEMO_FEES[cdt].inNetwork, inNetwork: true, ...extra };
}

const EMPLOYER = 'Acme Manufacturing';

export const PERSONAS: Record<PersonaId, Persona> = {
  dale: {
    id: 'dale',
    name: 'Dale',
    age: 56,
    blurb: 'Root canal, buildup and two crowns quoted this fall. $300 of a $1,500 max used.',
    memberId: 'M-10456',
    employer: EMPLOYER,
    coverage: 'Just me',
    currentDentistId: 'd01',
    profile: (asOf) => {
      const y = yearOf(asOf);
      const spring = `${y + 1}-03-31`;
      return {
        ...DEMO_PROFILE,
        asOf,
        ledger: {
          ...DEMO_PROFILE.ledger,
          planYear: y,
          history: DEMO_PROFILE.ledger.history.map((h) => ({ ...h, date: `${y}${h.date.slice(4)}` })),
          pastYears: [
            { year: y - 2, planPaid: 410, annualMax: 1500 },
            { year: y - 1, planPaid: 1500, annualMax: 1500 },
          ],
        },
        procedures: [
          proc('rc19', 'D3330', { tooth: 19, fee: 1180, deadline: addDays(asOf, 41), locked: true }),
          proc('bu19', 'D2950', { tooth: 19, deadline: spring, dependsOn: ['rc19'] }),
          proc('cr19', 'D2740', { tooth: 19, deadline: spring, dependsOn: ['bu19'] }),
          proc('cr30', 'D2740', { tooth: 30, deadline: spring }),
          proc('clean', 'D1110', { deadline: `${y + 1}-01-31` }),
          proc('rc3', 'D3330', { tooth: 3, deadline: `${y + 1}-12-31`, likelihood: 0.3 }),
        ],
      };
    },
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    age: 25,
    blurb: "New hire, off a parent's plan this year. Wisdom teeth still in.",
    memberId: 'M-20981',
    employer: EMPLOYER,
    coverage: 'Just me',
    currentDentistId: 'd06',
    profile: (asOf) => {
      const y = yearOf(asOf);
      return {
        asOf,
        currentPlan: ACME_LOW,
        ledger: {
          planYear: y,
          coverageStart: `${y}-03-01`,
          maxUsed: 85,
          deductibleMet: 0,
          orthoUsed: 0,
          rolloverBalance: 0,
          history: [{ date: `${y}-04-03`, cdt: 'D1110', planPaid: 85, inNetwork: true, source: 'claim' }],
          pastYears: [],
        },
        procedures: [proc('wt17', 'D7240', { tooth: 17 }), proc('wt32', 'D7240', { tooth: 32 }), proc('exam', 'D0120')],
        money: { fsaOffered: true, fsaBalance: 0, fsaRule: { kind: 'carryover', max: 680 }, marginalTaxRate: 0.2 },
        fees: DEMO_FEES,
      };
    },
  },
  priya: {
    id: 'priya',
    name: 'Priya',
    age: 38,
    blurb: 'One kid likely needs braces, and a "maybe" root canal for herself (30%).',
    memberId: 'M-33017',
    employer: EMPLOYER,
    coverage: 'Me + 2 kids',
    currentDentistId: 'd03',
    profile: (asOf) => {
      const y = yearOf(asOf);
      return {
        asOf,
        currentPlan: ACME_LOW,
        ledger: {
          planYear: y,
          coverageStart: `${y - 4}-01-01`,
          maxUsed: 298,
          deductibleMet: 50,
          orthoUsed: 0,
          rolloverBalance: 0,
          history: [
            { date: `${y}-01-22`, cdt: 'D1110', planPaid: 85, inNetwork: true, source: 'claim' },
            { date: `${y}-03-09`, cdt: 'D2392', tooth: 14, planPaid: 128, inNetwork: true, source: 'claim' },
            { date: `${y}-07-15`, cdt: 'D1110', planPaid: 85, inNetwork: true, source: 'claim' },
          ],
          pastYears: [
            { year: y - 2, planPaid: 420, annualMax: 1500 },
            { year: y - 1, planPaid: 380, annualMax: 1500 },
          ],
        },
        procedures: [
          proc('seal', 'D1351', { label: 'Sealants (Maya)' }),
          proc('braces', 'D8080', { label: 'Braces (Arjun)', deadline: `${y + 1}-12-31`, likelihood: 0.6 }),
          proc('rc3', 'D3330', { tooth: 3, deadline: `${y + 1}-12-31`, likelihood: 0.3 }),
        ],
        money: { fsaOffered: true, fsaBalance: 450, fsaRule: { kind: 'grace', until: '03-15' }, marginalTaxRate: 0.3 },
        fees: DEMO_FEES,
      };
    },
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

export const isPersonaId = (id: string): id is PersonaId => Object.hasOwn(PERSONAS, id);
