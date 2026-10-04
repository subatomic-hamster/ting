import { CheckIcon, InfoIcon } from './Icons';

export type Verification = 'verified' | 'unverified' | 'pending';

const STYLES: Record<Verification, { label: string; cls: string; dot: string }> = {
  verified: { label: 'Verified', cls: 'border-save/30 bg-save/10 text-save', dot: 'bg-save' },
  unverified: { label: 'Unverified', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-warn' },
  pending: { label: 'Checking…', cls: 'border-line bg-paper text-muted', dot: 'bg-muted animate-pulse' },
};

const TIPS: Record<Verification, string> = {
  verified: 'Every dollar in this explanation matches the engine',
  unverified: 'A dollar figure in this explanation did not match the engine',
  pending: 'Checking the explanation against the engine…',
};

const SUMMARY: Record<Verification, string> = {
  verified: 'Every amount in these explanations matches the engine',
  unverified: 'An explanation was held back: its numbers didn’t match the engine',
  pending: 'Checking each explanation against the engine…',
};

/** Automated Reasoning's verdict on the engine's number, proved against rules built from the plan document. */
export function ProofBadge({ verdict, claim }: { verdict: string; claim: string }) {
  const proved = verdict === 'VALID';
  const refuted = verdict === 'INVALID' || verdict === 'IMPOSSIBLE';
  const tip = proved
    ? `Automated Reasoning proved “${claim}” from your plan document's rules`
    : refuted
      ? `Automated Reasoning found “${claim}” contradicts your plan document's rules`
      : `Automated Reasoning couldn't decide “${claim}” (${verdict.toLowerCase().replace(/_/g, ' ')})`;
  const cls = proved ? 'border-brand-200 bg-brand-50 text-brand-700' : refuted ? 'border-cost/30 bg-cost/10 text-cost' : 'border-line bg-paper text-muted';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`} title={tip} aria-label={tip}>
      {proved ? 'Proved' : refuted ? 'Rule check failed' : 'Not proved'}
    </span>
  );
}

/** One badge for a whole set of explanations, with the reason spelled out. */
export function VerifiedBadge({ state }: { state: Verification }) {
  const s = STYLES[state];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
        {s.label}
      </span>
      <span>{SUMMARY[state]}</span>
    </span>
  );
}

/** A quiet per-step mark; the tooltip carries the detail. */
export function VerifiedMark({ state }: { state: Verification }) {
  const label = `${STYLES[state].label}: ${TIPS[state]}`;
  return (
    <span role="img" className="inline-flex shrink-0 items-center" title={TIPS[state]} aria-label={label}>
      {state === 'verified' ? (
        <CheckIcon width={12} height={12} className="text-save" />
      ) : state === 'unverified' ? (
        <InfoIcon width={12} height={12} className="text-warn" />
      ) : (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
      )}
    </span>
  );
}
