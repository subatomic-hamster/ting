// IRS health FSA limits. 2026: Rev. Proc. 2025-32 ($3,400 election, $680 carryover into 2027).
// The IRS publishes next year's figures each October; add the row when it does.
export const IRS_FSA: Record<number, { electionLimit: number; carryoverMax: number }> = {
  2026: { electionLimit: 3400, carryoverMax: 680 },
};

export function fsaLimits(year: number): { electionLimit: number; carryoverMax: number; provisional: boolean } {
  if (IRS_FSA[year]) return { ...IRS_FSA[year], provisional: false };
  const years = Object.keys(IRS_FSA).map(Number);
  const earlier = years.filter((y) => y < year);
  const nearest = earlier.length ? Math.max(...earlier) : Math.min(...years);
  return { ...IRS_FSA[nearest], provisional: true };
}
