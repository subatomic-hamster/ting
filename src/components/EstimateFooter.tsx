/** Shown right under every estimate total: the estimate never replaces the plan document or the dentist's plan. */
export function EstimateFooter({ className = "mt-2" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      This estimate is not a substitute for your plan document or your dentist’s
      treatment plan. Educational estimate, not insurance or tax advice.
    </p>
  );
}
