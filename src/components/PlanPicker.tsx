import { useAppStore } from "../store";

/** The plan you're on this year; waiving and membership plans are options for next year, not coverage now. */
export function PlanPicker({ className = "" }: { className?: string }) {
  const allPlans = useAppStore((s) => s.plans);
  const plan = useAppStore((s) => s.profile.currentPlan);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const plans = allPlans.filter((p) => p.kind === "insurance");

  return (
    <select
      aria-label="Dental plan"
      className={`min-w-0 max-w-full rounded-lg border border-line bg-white px-2 py-1 text-sm font-medium text-ink ${className}`}
      value={plan.id}
      onChange={(e) => setCurrentPlan(e.target.value)}
    >
      {plans.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
