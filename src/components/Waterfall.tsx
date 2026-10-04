import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { explainLine, verifyNumbers } from '../engine/explain';
import type { AdjudicatedLine, PlanRules, WaterfallKey, WaterfallStep } from '../engine/types';
import { explainQuery } from '../lib/explainQuery';
import { formatMoney } from '../lib/format';
import { isTotal, waterfallBars } from '../lib/geometry';
import { GlossaryTerm } from './GlossaryTerm';
import { ProofBadge } from './VerifiedBadge';

const TONE: Record<string, string> = {
  total: 'bg-muted',
  down: 'bg-plan',
  up: 'bg-cost',
  flat: 'bg-line',
};

const TERM: Partial<Record<WaterfallKey, 'deductible' | 'coinsurance' | 'annual maximum'>> = {
  deductible: 'deductible',
  coinsurance: 'coinsurance',
  maxCap: 'annual maximum',
};

/** Totals show the running amount; every other step shows its change to what you pay. */
const shown = (s: WaterfallStep) => (isTotal(s) ? s.running : s.delta);


export function Waterfall({ line, rules, name }: { line: AdjudicatedLine; rules: PlanRules; name: string }) {
  const steps = line.waterfall;
  // The engine's own sentences show at once; the reworded ones replace them when ready, and only if every dollar
  // in them matches the engine.
  const template = explainLine(line);
  const explained = useQuery(explainQuery(line, rules, api));
  const bars = waterfallBars(steps);
  const summary = steps.map((s) => `${s.label}: ${formatMoney(shown(s), { signed: !isTotal(s) })}`).join('; ');

  return (
    <figure aria-label={`Cost waterfall for ${name}. ${summary}.`}>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => {
          const polished = explained.data?.find((e) => e.key === s.key);
          const text = polished && verifyNumbers(polished.text, line).ok ? polished.text : template.find((e) => e.key === s.key)?.text;
          const proof = polished?.reasoning;
          const isFinal = s.key === 'youPay';
          const term = TERM[s.key];
          return (
            <li key={s.key} className={`py-3 first:pt-0 last:pb-0 ${isFinal ? 'border-t-2 border-ink/80' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`min-w-0 flex-1 text-sm sm:w-56 sm:flex-none ${isFinal ? 'font-semibold' : 'font-medium'}`}>
                  {term ? <GlossaryTerm term={term}>{s.label}</GlossaryTerm> : s.label}
                </div>
                <div className="relative hidden h-5 flex-1 rounded bg-paper sm:block" aria-hidden>
                  <div
                    className={`absolute top-0.5 bottom-0.5 rounded ${isFinal ? 'bg-ink' : TONE[bars[i].tone]}`}
                    style={{ left: `${bars[i].leftPct}%`, width: `${Math.max(bars[i].widthPct, bars[i].tone === 'flat' ? 0.6 : 0)}%` }}
                  />
                </div>
                <div className={`tabular w-24 shrink-0 text-right ${isFinal ? 'text-base font-semibold' : 'text-sm font-medium'}`}>
                  {formatMoney(shown(s), { signed: !isTotal(s) })}
                </div>
              </div>
              {text && <p className="mt-1 text-sm text-ink/75">{text}</p>}
              {(s.section || proof || !isFinal) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {!isFinal && <span className="tabular">Running total {formatMoney(s.running)}</span>}
                  {s.section && (
                    <span>
                      · Plan rule: <cite className="not-italic text-ink">{s.section}</cite>
                    </span>
                  )}
                  {proof && <ProofBadge verdict={proof.verdict} claim={proof.claim} />}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
