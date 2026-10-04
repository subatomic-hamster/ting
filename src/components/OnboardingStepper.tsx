import { useState } from "react";
import { Link } from "react-router-dom";
import { IntakeBox } from "./IntakeBox";
export function OnboardingStepper() {
  const [started, setStarted] = useState(false);
  return (
    <section className="mx-auto max-w-2xl border-t border-line pt-5">
      <h2>
        {started
          ? "Add your dentist’s treatment plan"
          : "Start with one person’s care"}
      </h2>
      {started ? (
        <>
          <p className="mt-3 mb-6 text-base text-muted">
            Review the procedures before adding them. Enter any quoted fees and
            only dates your dentist supplied.
          </p>
          <IntakeBox />
          <Link to="/treatment" className="btn-secondary mt-6 w-full">
            Review treatment and dates
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-base">
            Ting estimates treatment for one person at a time. Family
            deductibles and combined family care need confirmation with your
            insurer.
          </p>
          <p className="mt-3 text-base text-muted">
            You can type a treatment plan, upload a document, or browse
            procedures including braces. No treatment is added automatically.
          </p>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => setStarted(true)}
          >
            Add my treatment plan
          </button>
        </>
      )}
    </section>
  );
}
