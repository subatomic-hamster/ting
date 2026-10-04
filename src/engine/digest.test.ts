import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../data/personas';
import { buildDigest, digestDue } from './digest';
import { dollarsIn } from './explain';
import { optimize } from './schedule';

describe('buildDigest', () => {
  const profile = PERSONAS.dale.profile('2026-10-03');
  const digest = buildDigest(profile, optimize(profile, { horizon: 2 }).cheapest);
  it('lists amounts that all come from the engine', () => {
    expect(digest.body.length).toBeGreaterThan(0);
    for (const n of dollarsIn(digest.body)) expect(digest.amounts.map((a) => Math.round(a * 100))).toContain(Math.round(n * 100));
  });
});

describe('digestDue', () => {
  it('weekly on Mondays, monthly on the first Monday, never when off', () => {
    expect(digestDue('weekly', '2026-10-05')).toBe(true); // Monday
    expect(digestDue('weekly', '2026-10-06')).toBe(false);
    expect(digestDue('monthly', '2026-10-05')).toBe(true); // first Monday of October
    expect(digestDue('monthly', '2026-10-12')).toBe(false);
    expect(digestDue('off', '2026-10-05')).toBe(false);
  });
});
