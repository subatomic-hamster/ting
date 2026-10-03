import { explainLine, verifyNumbers } from '../../engine/explain';
import { usd } from '../../engine/format';
import type { AdjudicatedLine, WaterfallStep } from '../../engine/types';

const W = 640;
const H = 230;
const TOP = 26;
const BASE = 180;

function color(step: WaterfallStep): string {
  if (step.key === 'fee') return 'var(--neutral-bar)';
  if (step.key === 'youPay') return 'var(--you)';
  if (step.key === 'coinsurance') return 'var(--plan)';
  if (step.delta < 0) return '#b9c6d0'; // discounts: money nobody pays
  return 'var(--you)';
}

function wrap(label: string): string[] {
  const words = label.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > 14 && cur) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}

/** Fee → network discount → plan's share → deductible / max cap → you pay. Every number from the engine. */
export function Waterfall({ line }: { line: AdjudicatedLine }) {
  const steps = line.waterfall;
  const top = Math.max(...steps.map((s) => s.running), line.billed) || 1;
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const slot = W / steps.length;
  const bw = Math.min(64, slot * 0.6);
  let prev = 0;
  const bars = steps.map((s, i) => {
    const isTotal = s.key === 'fee' || s.key === 'youPay';
    const from = isTotal ? 0 : prev;
    const to = s.running;
    prev = s.running;
    const x = i * slot + (slot - bw) / 2;
    const y1 = y(Math.max(from, to));
    const h = Math.max(s.key === 'denied' ? 0 : 2, Math.abs(y(from) - y(to)));
    const amount = isTotal ? usd(s.running) : s.key === 'denied' ? '$0' : `${s.delta > 0 ? '+' : '−'}${usd(Math.abs(s.delta))}`;
    return { s, x, y1, h, amount, i };
  });

  return (
    <figure className="waterfall" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cost breakdown: ${steps.map((s) => `${s.label} ${usd(s.running)}`).join(', ')}`}>
        <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--line)" />
        {bars.map(({ s, x, y1, h, amount, i }) => (
          <g key={s.key + i}>
            <title>{`${s.label}: ${amount} (running ${usd(s.running)})`}</title>
            {/* hit target bigger than the mark */}
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
            {i > 0 && <line x1={x - (slot - bw)} x2={x} y1={y(bars[i - 1].s.running)} y2={y(bars[i - 1].s.running)} stroke="var(--muted)" strokeDasharray="2 3" />}
            <rect x={x} y={y1} width={bw} height={h} rx={4} fill={color(s)} />
            <text x={x + bw / 2} y={y1 - 7} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)">
              {amount}
            </text>
            {wrap(s.label).map((t, j) => (
              <text key={j} x={x + bw / 2} y={BASE + 18 + j * 15} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {t}
              </text>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="legend">
        <span><i style={{ background: 'var(--plan)' }} />Plan pays</span>
        <span><i style={{ background: 'var(--you)' }} />You pay</span>
        <span><i style={{ background: '#b9c6d0' }} />Discount</span>
        <span>Rules {line.rulesVersion}</span>
      </figcaption>
    </figure>
  );
}

/** One plain sentence per step with its plan citation; the badge says every dollar matched the engine. */
export function Explanation({ line }: { line: AdjudicatedLine }) {
  return (
    <ul className="explain">
      {explainLine(line).map((s, i) => {
        const check = verifyNumbers(s.text, line);
        return (
          <li key={s.key + i}>
            <span>{s.text}</span>
            <span className={`badge ${check.ok ? 'ok' : 'warn'}`} title={check.ok ? 'Every dollar figure matches the engine output' : `Unverified: ${check.unknown.map(usd).join(', ')}`}>
              {check.ok ? 'Numbers checked' : 'Not verified'}
            </span>
            {s.section && <cite>{s.section}</cite>}
          </li>
        );
      })}
    </ul>
  );
}
