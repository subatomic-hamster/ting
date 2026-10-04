import type { Adherence } from "../../habits/analytics";
import { Link } from "react-router-dom";
export function HabitEstimateCard(_props: { adherence: Adherence }) {
  void _props;
  return (
    <div>
      <p className="text-base">
        Your brushing record supports a conversation with your dentist. It does
        not predict whether you need a filling or root canal.
      </p>
      <Link to="/enroll#maybes" className="btn-ghost mt-3">
        Review uncertain treatment costs
      </Link>
    </div>
  );
}
