import { QUADRANTS } from '../../habits/program';

// Mirror view: your right side is on the right of the screen.
// Order matches the brush's sectors: upper right, upper left, lower left, lower right.
const PATHS = [
  'M104,22 Q150,22 168,62', // upper right
  'M96,22 Q50,22 32,62', // upper left
  'M32,80 Q50,120 96,120', // lower left
  'M168,80 Q150,120 104,120', // lower right
];
const LABELS: [number, number, 'start' | 'end'][] = [
  [178, 30, 'start'],
  [22, 30, 'end'],
  [22, 118, 'end'],
  [178, 118, 'start'],
];

export function QuadrantMap({
  shares,
  active = 0,
  weakest,
  size = 200,
}: {
  shares?: number[]; // share of brushing time per quadrant, 0-1
  active?: number; // 1-based quadrant being brushed now
  weakest?: number; // 0-based quadrant to flag
  size?: number;
}) {
  const color = (i: number) => {
    if (active === i + 1) return 'var(--color-brand-500)';
    if (weakest === i) return 'var(--color-warn)';
    if (shares) return `color-mix(in srgb, var(--color-brand-500) ${Math.round(25 + (shares[i] ?? 0) * 220)}%, #e2e8f0)`;
    return '#e2e8f0';
  };
  const label = shares
    ? `Brushing time by area: ${QUADRANTS.map((q, i) => `${q} ${Math.round((shares[i] ?? 0) * 100)}%`).join(', ')}`
    : active
      ? `Now brushing: ${QUADRANTS[active - 1]}`
      : 'Mouth map';

  return (
    <svg viewBox="-44 0 288 142" width={size} height={(size * 142) / 288} role="img" aria-label={label} className="max-w-full">
      {PATHS.map((d, i) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={color(i)}
          strokeWidth={active === i + 1 ? 22 : 18}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      ))}
      {QUADRANTS.map((q, i) => (
        <text key={q} x={LABELS[i][0]} y={LABELS[i][1]} textAnchor={LABELS[i][2]} className="fill-current text-[9px] text-muted">
          {q.replace('Upper', 'Up.').replace('Lower', 'Low.')}
          {shares ? ` ${Math.round((shares[i] ?? 0) * 100)}%` : ''}
        </text>
      ))}
      <text x="100" y="75" textAnchor="middle" className="fill-current text-[8px] text-muted">
        mirror view
      </text>
    </svg>
  );
}
