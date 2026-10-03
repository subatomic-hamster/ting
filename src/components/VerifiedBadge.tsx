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
