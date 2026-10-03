/** "$1,180" or "$87.50": whole dollars unless there are cents. */
export function usd(n: number): string {
  const cents = Math.round(Math.abs(n) * 100) % 100 !== 0;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
}

export const pct = (rate: number) => `${Math.round(rate * 100)}%`;
