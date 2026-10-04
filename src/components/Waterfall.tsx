import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../api';
import { verifyNumbers } from '../engine/explain';
import type { AdjudicatedLine, PlanRules, WaterfallKey, WaterfallStep } from '../engine/types';
import { formatMoney } from '../lib/format';
import { isTotal, waterfallBars } from '../lib/geometry';
import { GlossaryTerm } from './GlossaryTerm';
import { ProofBadge, VerifiedBadge, VerifiedMark, type Verification } from './VerifiedBadge';

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
  // Words come from the API (Bedrock in AWS); every dollar in them must match the engine before it's shown.
  const signature = `${line.id}|${line.rulesVersion}|${steps.map((s) => `${s.key}:${s.delta}:${s.running}`).join('|')}`;
  const explained = useQuery({
    queryKey: ['explain', signature],
    queryFn: () => api.explain(line, rules),
    placeholderData: keepPreviousData,
  });
  const fresh = explained.data && !explained.isPlaceholderData;
  const bars = waterfallBars(steps);
  const summary = steps.map((s) => `${s.label}: ${formatMoney(shown(s), { signed: !isTotal(s) })}`).join('; ');
  const explainedStep = (s: WaterfallStep) => (fresh ? explained.data?.find((e) => e.key === s.key) : undefined);
  const verificationOf = (text?: string): Verification => (!text ? 'pending' : verifyNumbers(text, line).ok ? 'verified' : 'unverified');
  // One badge for the whole waterfall; the worst step decides it.
  const states = steps.map((s) => verificationOf(explainedStep(s)?.text));
  const overall: Verification = states.includes('unverified') ? 'unverified' : states.includes('pending') ? 'pending' : 'verified';

  return (
    <figure aria-label={`Cost waterfall for ${name}. ${summary}.`}>
      <p className="mb-3 text-xs text-muted" aria-live="polite">
        <VerifiedBadge state={overall} />
      </p>
      <ol className="space-y-2.5" key={signature}>
        {steps.map((s, i) => {
          const step = explainedStep(s);
          const text = step?.text;
          const proof = step?.reasoning;
          const verification = states[i];
          const isFinal = s.key === 'youPay';
          const term = TERM[s.key];
          return (
            <li key={s.key} className={isFinal ? 'border-t border-line pt-3' : ''}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 items-start justify-between gap-2 sm:w-64 sm:shrink-0">
                  <div className={`min-w-0 text-sm ${isFinal ? 'font-semibold' : ''}`}>
                    {term ? <GlossaryTerm term={term}>{s.label}</GlossaryTerm> : s.label}
                  </div>
                  <div className={`tabular shrink-0 text-sm sm:hidden ${isFinal ? 'text-base font-semibold' : 'font-medium'}`}>
                    {formatMoney(shown(s), { signed: !isTotal(s) })}
                  </div>
                </div>
                <div className="relative h-6 flex-1 rounded bg-paper">
                  <motion.div
                    className={`absolute top-0.5 bottom-0.5 rounded ${isFinal ? 'bg-ink' : TONE[bars[i].tone]}`}
                    style={{ left: `${bars[i].leftPct}%` }}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: `${Math.max(bars[i].widthPct, bars[i].tone === 'flat' ? 0.6 : 0)}%`, opacity: 1 }}
                    transition={{ delay: i * 0.12, duration: 0.25, ease: 'easeOut' }}
                  />
                </div>
                <div className={`tabular hidden w-24 shrink-0 text-right text-sm sm:block ${isFinal ? 'text-base font-semibold' : 'font-medium'}`}>
                  {formatMoney(shown(s), { signed: !isTotal(s) })}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted sm:pl-[16.75rem]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular">Running total {formatMoney(s.running)}</span>
                  <VerifiedMark state={verification} />
                  {proof && <ProofBadge verdict={proof.verdict} claim={proof.claim} />}
                  {step?.clarity === 'rewritten' && <span className="text-[10px] text-muted">reworded for clarity</span>}
                  {s.section && (
                    <span>
                      Plan rule: <cite className="not-italic text-ink">{s.section}</cite>
                    </span>
                  )}
                </div>
                {text && verification === 'verified' ? (
                  <p className="mt-0.5 text-ink/80">{text}</p>
                ) : text ? (
                  <p className="mt-0.5 text-warn">Explanation held back: its numbers didn't match the engine.</p>
                ) : (
                  <p className="mt-0.5 h-3 w-2/3 animate-pulse rounded bg-line" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
