export function DemoDataPill({ label = 'Demo data', className = '' }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-800 ${className}`}
      title="Simulated for the demo — not real data"
    >
      {label}
    </span>
  );
}
