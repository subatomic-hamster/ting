export type Verification = 'verified' | 'unverified' | 'pending';

const STYLES: Record<Verification, { label: string; cls: string; dot: string }> = {
  verified: { label: 'Verified', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  unverified: { label: 'Unverified', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  pending: { label: 'Checking…', cls: 'border-line bg-slate-50 text-muted', dot: 'bg-slate-400 animate-pulse' },
};

const TIPS: Record<Verification, string> = {
  verified: 'Every dollar in this explanation matches the engine',
  unverified: 'A dollar figure in this explanation did not match the engine',
  pending: 'Checking the explanation against the engine…',
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
  const cls = proved ? 'border-sky-200 bg-sky-50 text-sky-800' : refuted ? 'border-red-200 bg-red-50 text-red-800' : 'border-line bg-slate-50 text-muted';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`} title={tip} aria-label={tip}>
      {proved ? 'Proved' : refuted ? 'Rule check failed' : 'Not proved'}
    </span>
  );
}

export function VerifiedBadge({ state }: { state: Verification }) {
  const s = STYLES[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}
      title={TIPS[state]}
      aria-label={`${s.label}: ${TIPS[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
