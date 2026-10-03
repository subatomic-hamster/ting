export function SamplePlanNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      <span className="font-semibold text-warn">Sample plan</span> — confirm against the official plan document.
    </p>
  );
}
