import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../data/demo';
import { PERSONAS, PERSONA_IDS } from '../data/personas';
import { leftOnTable } from './helpers';
import { buildReminders, reminderStatus } from './reminders';
import { evaluateSchedule, optimize } from './schedule';
import type { Profile } from './types';

const nothingPlanned = (profile: Profile) => {
  const empty = { ...profile, procedures: [] };
  return { profile: empty, ev: evaluateSchedule(empty, [], { horizon: 2 }) };
};

describe('year-end reminders', () => {
  it('builds Nov 1 and Dec 1 reminders from what is left on the table', () => {
    const { profile, ev } = nothingPlanned(DEMO_PROFILE);
    // $1,200 of max and one cleaning left; the $680 carryover keeps the whole $400 FSA balance.
    const reminders = buildReminders(profile, ev);
    expect(reminders.map((r) => [r.kind, r.sendOn])).toEqual([
      ['nov1', '2026-11-01'],
      ['dec1', '2026-12-01'],
    ]);
    const [nov] = reminders;
    expect(nov).toMatchObject({ id: '2026-nov1', maxRemaining: 1200, unusedCleanings: 1, fsaExpiring: 0 });
    expect(nov.body).toBe('You still have $1,200 of annual max and 1 covered cleaning for 2026. They reset on Jan 1, so book now while appointments are open.');
    expect(reminders[1].title).toBe('Last month: $1,200 of annual max and 1 covered cleaning left');
  });

  it('adds an FSA reminder 10 days before the forfeit date, with the amount at risk', () => {
    const { profile, ev } = nothingPlanned({ ...DEMO_PROFILE, money: { ...DEMO_PROFILE.money, fsaRule: { kind: 'none' } } });
    const reminders = buildReminders(profile, ev);
    const fsa = reminders.find((r) => r.kind === 'fsa');
    expect(fsa).toMatchObject({ sendOn: '2026-12-21', fsaExpiring: 400, fsaDeadline: '2026-12-31' });
    expect(fsa?.body).toBe('Your 2026 FSA money must be spent by Dec 31, 2026. Use $400 on eligible care before then or forfeit it.');
    expect(reminders.find((r) => r.kind === 'dec1')?.body).toContain('$1,200 of annual max, 1 covered cleaning and $400 of FSA money');
    expect(reminders.map((r) => r.sendOn)).toEqual(['2026-11-01', '2026-12-01', '2026-12-21']);
  });

  it('follows a grace period into next year and keeps it out of the Dec 31 reminders', () => {
    const { profile, ev } = nothingPlanned({
      ...DEMO_PROFILE,
      money: { ...DEMO_PROFILE.money, fsaRule: { kind: 'grace', until: '03-15' } },
    });
    const reminders = buildReminders(profile, ev);
    expect(reminders.find((r) => r.kind === 'fsa')).toMatchObject({ sendOn: '2027-03-05', fsaDeadline: '2027-03-15', fsaExpiring: 400 });
    expect(reminders.find((r) => r.kind === 'dec1')?.body).not.toContain('FSA');
  });

  it('sends nothing when nothing would be lost', () => {
    const { profile, ev } = nothingPlanned({ ...DEMO_PROFILE, currentPlan: { ...DEMO_PROFILE.currentPlan, frequencyLimits: [] } });
    const usedUp = { ...ev, years: ev.years.map((y, i) => (i === 0 ? { ...y, maxRemaining: 0 } : y)) };
    expect(buildReminders(profile, usedUp)).toEqual([]);
  });

  it("uses the engine's numbers for every persona", () => {
    for (const id of PERSONA_IDS) {
      const profile = PERSONAS[id].profile('2026-10-05');
      const ev = optimize(profile, { horizon: 2 }).cheapest;
      const left = leftOnTable(profile, ev);
      for (const r of buildReminders(profile, ev)) {
        expect(r).toMatchObject(left);
        expect(r.sendOn >= profile.asOf).toBe(true);
      }
    }
  });

  it('marks the latest past reminder due, earlier ones sent, later ones scheduled', () => {
    const { profile, ev } = nothingPlanned({ ...DEMO_PROFILE, money: { ...DEMO_PROFILE.money, fsaRule: { kind: 'none' } } });
    const reminders = buildReminders(profile, ev);
    const at = (asOf: string) => reminders.map((r) => reminderStatus(reminders, asOf).get(r.id));
    expect(at('2026-10-05')).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(at('2026-12-01')).toEqual(['sent', 'due', 'scheduled']);
    expect(at('2026-12-24')).toEqual(['sent', 'sent', 'due']);
  });
});
