import { useQuery } from '@tanstack/react-query';
import { PageHeader, Section } from '../components/Section';

interface Bin {
  range: string;
  n: number;
  accuracy: number | null;
  confidence: number | null;
}
interface Calibration {
  generatedAt: string;
  model: string;
  examples: number;
  byKind: Record<string, number>;
  temperature: number;
  errors?: number;
  raw: { accuracy: number; ece: number; bins: Bin[] };
  calibrated: { accuracy: number; ece: number; bins: Bin[] };
}

const W = 320;
const H = 240;
const PAD = 36;
const x = (v: number) => PAD + v * (W - PAD - 8);
const y = (v: number) => H - PAD - v * (H - PAD - 8);

/** Reliability diagram: for each confidence band, how often Winnow's top answer was right (spec F8 calibration). */
export default function CalibrationPage() {
  const data = useQuery({ queryKey: ['calibration'], queryFn: async () => (await fetch('/calibration.json')).json() as Promise<Calibration> });
  const c = data.data;
  return (
    <div className="space-y-5">
      <PageHeader title="Winnow calibration" subtitle="When Winnow says 90%, how often is it right on dental intake? Measured on hand-labelled examples." />
      {!c ? (
        <p className="text-sm text-muted">{data.isError ? 'No calibration run yet: node infra/calibrate.mjs' : 'Loading…'}</p>
      ) : (
        <Section title={`${c.examples} labelled examples · ${Math.round(c.calibrated.accuracy * 100)}% top-answer accuracy`} id="chart">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label="Reliability diagram">
            <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-muted)" strokeDasharray="4 3" />
            <line x1={PAD} y1={y(0)} x2={W - 8} y2={y(0)} stroke="var(--color-line)" />
            <line x1={PAD} y1={y(0)} x2={PAD} y2={8} stroke="var(--color-line)" />
            {[0, 0.5, 1].map((t) => (
              <text key={`y${t}`} x={PAD - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">
                {t * 100}%
              </text>
            ))}
            {[0, 0.5, 1].map((t) => (
              <text key={`x${t}`} x={x(t)} y={H - PAD + 14} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                {t * 100}%
              </text>
            ))}
            <text x={(W + PAD) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
              Winnow&rsquo;s confidence
            </text>
            {c.calibrated.bins
              .filter((b) => b.n && b.confidence !== null && b.accuracy !== null)
              .map((b) => (
                <g key={b.range}>
                  <circle cx={x(b.confidence ?? 0)} cy={y(b.accuracy ?? 0)} r={3 + Math.sqrt(b.n) * 1.5} fill="var(--color-brand-600)" fillOpacity="0.55" />
                  <title>{`${b.range}: right ${Math.round((b.accuracy ?? 0) * 100)}% of ${b.n}`}</title>
                </g>
              ))}
          </svg>
          <p className="mt-2 text-sm text-muted">
            Dots on the dashed line mean the confidence is honest. Bigger dots hold more examples.{' '}
            {(c.errors ?? 0) >= 3
              ? `Temperature ${c.temperature} fitted on this set; calibration error ${c.raw.ece.toFixed(3)} → ${c.calibrated.ece.toFixed(3)} (fitted and scored on the same examples).`
              : `Temperature kept at 1.0: only ${c.errors ?? 0} wrong answer(s), too few to fit one honestly. Calibration error ${c.raw.ece.toFixed(3)}.`}{' '}
            {c.model}.
          </p>
          <table className="mt-3 text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pr-6">Winnow says</th>
                <th className="pr-6">Examples</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {c.calibrated.bins.map((b) => (
                <tr key={b.range}>
                  <td className="pr-6">{b.range}</td>
                  <td className="pr-6">{b.n}</td>
                  <td>{b.accuracy === null ? '–' : `${Math.round(b.accuracy * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
