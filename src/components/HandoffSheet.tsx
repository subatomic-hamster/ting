import type { PlannedProcedure } from "../engine/types";
import { GENERAL_QUESTIONS } from "../hooks/useDentistQuestions";
import { formatDate, formatMoney, procedureName } from "../lib/format";
import type { ActiveSchedule } from "../store";
import { PrintIcon } from "./Icons";
export function HandoffSheet({
  patientName,
  procedures,
  schedule,
  rulesVersion,
}: {
  patientName: string;
  procedures: PlannedProcedure[];
  schedule: ActiveSchedule;
  rulesVersion: string;
}) {
  const byId = new Map(procedures.map((p) => [p.id, p]));
  const lines = new Map(schedule.lines.map((l) => [l.id, l]));
  const questions = [...schedule.questions, ...GENERAL_QUESTIONS].slice(0, 3);
  const rows = [...schedule.placements].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return (
    <article className="bg-white print:p-0">
      <header className="border-b border-line pb-5">
        <p className="mb-3 text-xs text-muted">Ting · Shared treatment plan</p>
        <h1>{patientName}’s treatment plan</h1>
        <p className="mt-3 text-base">
          {schedule.kind === "custom"
            ? "Patient’s edited dates"
            : `${schedule.kind[0].toUpperCase()}${schedule.kind.slice(1)} schedule`}
          . Estimated total you pay: {formatMoney(schedule.expectedOwes)}.
        </p>
        <button
          className="btn-primary no-print mt-5"
          onClick={() => window.print()}
        >
          <PrintIcon />
          Print treatment plan
        </button>
      </header>
      <section className="mt-6">
        <h2>Planned appointments</h2>
        <ol className="divide-y divide-line">
          {rows.map((pl) => {
            const p = byId.get(pl.id);
            const line = lines.get(pl.id);
            return (
              <li key={pl.id} className="py-5">
                <h3>{p ? procedureName(p) : "Treatment item"}</h3>
                <dl className="mt-3 space-y-3">
                  <div>
                    <dt className="text-xs text-muted">
                      Target date
                      {p?.cdt.startsWith("D8") ? " (treatment start)" : ""}
                    </dt>
                    <dd>
                      {formatDate(pl.date, { year: true })}
                      {p?.locked && ". Date set by dentist."}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      Estimated amount you pay
                    </dt>
                    <dd className="tabular">
                      {line ? formatMoney(line.memberOwes) : "Unavailable"}
                      {p?.likelihood !== undefined &&
                        p.likelihood < 1 &&
                        " if needed"}
                    </dd>
                  </div>
                </dl>
                {line?.pricingWarning && (
                  <p className="mt-3">{line.pricingWarning}</p>
                )}
                <details className="mt-3">
                  <summary className="text-brand-700">
                    Procedure reference
                  </summary>
                  <p className="text-xs">
                    Billing code: {p?.cdt}. Estimate rules: {rulesVersion}.
                  </p>
                </details>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="mt-6 border-t border-line pt-5">
        <h2>Questions for the dental office</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          {questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </section>
      <p className="mt-6 text-xs text-muted">
        Dates are planning targets. Clinical judgment comes first. Please
        confirm whether any treatment can safely wait.
      </p>
    </article>
  );
}
