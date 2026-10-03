import { describe, expect, it } from 'vitest';
import { mockApi } from './mockApi';

describe('mock intake parser', () => {
  it('finds procedures, counts and tooth numbers', async () => {
    const { items } = await mockApi.parseDescription('Root canal on #19, a buildup and two crowns. Also a deep cleaning.');
    const codes = items.map((i) => i.cdt).sort();
    expect(codes).toEqual(['D2740', 'D2740', 'D2950', 'D3330', 'D4341']);
    expect(items.find((i) => i.cdt === 'D3330')?.tooth).toBe(19);
  });

  it('marks "maybe" work with a likelihood and asks a follow-up', async () => {
    const { items, questions } = await mockApi.parseDescription('I might need braces');
    expect(items[0].cdt).toBe('D8080');
    expect(items[0].likelihood).toBe(0.5);
    expect(questions.some((q) => q.id === 'likelihood')).toBe(true);
  });
});
