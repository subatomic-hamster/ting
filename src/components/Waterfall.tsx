import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { api } from '../api';
import type { ProcedureItem, WaterfallStep } from '../contracts';
import { formatMoney } from '../lib/format';
import { waterfallBars } from '../lib/geometry';
import { GlossaryTerm } from './GlossaryTerm';
import { VerifiedBadge } from './VerifiedBadge';

const TONE: Record<string, string> = {
  total: 'bg-slate-400',
  down: 'bg-plan',
  up: 'bg-cost',
  flat: 'bg-slate-300',
};

const TERM: Partial<Record<WaterfallStep['key'], 'deductible' | 'coinsurance' | 'annual maximum' | 'balance billing'>> = {
  deductible: 'deductible',
  coinsurance: 'coinsurance',
  maxCap: 'annual maximum',
};

export function Waterfall({ procedure, steps }: { procedure: ProcedureItem; steps: WaterfallStep[] }) {
  // Explanations come from the API (the AI in real mode). Amounts always come from the engine.
  const signature = steps.map((s) => `${s.key}:${s.amount}`).join('|');
  const explained = useQuery({
    queryKey: ['explain', procedure.id, signature],
    queryFn: () => api.explain(procedure.id, steps),
    placeholderData: keepPreviousData,
  });
  const fresh = explained.data && !explained.isPlaceholderData;
  const bars = waterfallBars(steps);
  const youPay = steps[steps.length - 1];

  const summary = steps.map((s) => `${s.label}: ${formatMoney(s.amount, { signed: s.key !== 'fee' && s.key !== 'youPay' })}`).join('; ');

  return (
    <figure aria-label={`Cost waterfall for ${procedure.label}. ${summary}.`}>
      <ol className="space-y-2.5" key={signature}>
        {steps.map((s, i) => {
          const ex = explained.data?.find((e) => e.key === s.key);
          const verification = fresh ? (ex?.verification ?? s.verification) : s.verification;
          const isFinal = s.key === 'youPay';
          return (
            <li key={s.key} className={isFinal ? 'border-t border-line pt-3' : ''}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 items-start justify-between gap-2 sm:w-64 sm:shrink-0">
                  <div className={`min-w-0 text-sm ${isFinal ? 'font-semibold' : ''}`}>
                    {TERM[s.key] ? (
                      <GlossaryTerm term={TERM[s.key]!}>{s.label}</GlossaryTerm>
                    ) : (
                      s.label
                    )}
                  </div>
                  <div className={`tabular shrink-0 text-sm sm:hidden ${isFinal ? 'text-base font-semibold' : 'font-medium'}`}>
                    {formatMoney(s.amount, { signed: !isFinal && s.key !== 'fee' })}
                  </div>
                </div>
                <div className="relative h-6 flex-1 rounded bg-slate-50">
                  <motion.div
                    className={`absolute top-0.5 bottom-0.5 rounded ${isFinal ? 'bg-ink' : TONE[bars[i].tone]}`}
                    style={{ left: `${bars[i].leftPct}%` }}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: `${Math.max(bars[i].widthPct, bars[i].tone === 'flat' ? 0.6 : 0)}%`, opacity: 1 }}
                    transition={{ delay: i * 0.12, duration: 0.25, ease: 'easeOut' }}
                  />
                </div>
                <div className={`tabular hidden w-24 shrink-0 text-right text-sm sm:block ${isFinal ? 'text-base font-semibold' : 'font-medium'}`}>
                  {formatMoney(s.amount, { signed: !isFinal && s.key !== 'fee' })}
                </div>
              </div>
              <StepDetails step={s} explanation={ex?.explanation} verification={verification} loading={!fresh} />
            </li>
          );
        })}
      </ol>
      <figcaption className="sr-only">You pay {formatMoney(youPay.amount)}.</figcaption>
    </figure>
  );
}

function StepDetails({
  step,
  explanation,
  verification,
  loading,
}: {
  step: WaterfallStep;
  explanation?: string;
  verification?: WaterfallStep['verification'];
  loading: boolean;
}) {
  const [showCite, setShowCite] = useState(false);
  return (
    <div className="mt-1 text-xs text-muted sm:pl-[16.75rem]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular">Running total {formatMoney(step.runningTotal)}</span>
        {verification && <VerifiedBadge state={verification} />}
        {step.citation && (
          <button
            type="button"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
            aria-expanded={showCite}
            onClick={() => setShowCite((v) => !v)}
          >
            {showCite ? 'Hide plan rule' : 'Plan rule'}
          </button>
        )}
      </div>
      {explanation ? (
        <p className="mt-0.5 text-ink/80">{explanation}</p>
      ) : (
        loading && <p className="mt-0.5 h-3 w-2/3 animate-pulse rounded bg-slate-100" aria-hidden />
      )}
      {showCite && step.citation && (
        <blockquote className="mt-1 rounded-lg border-l-2 border-brand-500 bg-brand-50 px-2 py-1 text-ink">{step.citation}</blockquote>
      )}
    </div>
  );
}
