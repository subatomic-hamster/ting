import type { ProcedureItem, ScheduleOption } from '../contracts';
import { GENERAL_QUESTIONS } from '../hooks/useDentistQuestions';
import { formatDate } from '../lib/format';
import { PrintIcon, ToothIcon } from './Icons';

const KIND: Record<ScheduleOption['kind'], string> = {
  cheapest: 'lowest-cost order',
  fastest: 'fastest order',
  balanced: 'balanced order',
  custom: "patient's chosen order",
};

export function HandoffSheet({
  patientName,
  procedures,
  option,
  rulesVersion,
}: {
  patientName: string;
  procedures: ProcedureItem[];
  option: ScheduleOption;
  rulesVersion: string;
}) {
  const byId = new Map(procedures.map((p) => [p.id, p]));
  const questions = [
    ...option.items.map((i) => i.dentistQuestion).filter((q): q is string => Boolean(q)),
    ...GENERAL_QUESTIONS,
  ].slice(0, 3);

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-5 sm:p-8 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white" aria-hidden>
            <ToothIcon width={22} height={22} />
          </span>
          <div>
            <p className="eyebrow">Treatment handoff for the dental office</p>
            <h1 className="text-xl font-semibold sm:text-2xl">{patientName}'s treatment plan</h1>
          </div>
        </div>
        <button type="button" className="btn-secondary no-print" onClick={() => window.print()}>
          <PrintIcon /> Print
        </button>
      </header>

      <section className="mt-5">
        <h2 className="text-sm font-semibold">Recommended order ({KIND[option.kind]})</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-2 font-medium">#</th>
                <th scope="col" className="py-2 pr-2 font-medium">CDT</th>
                <th scope="col" className="py-2 pr-2 font-medium">Procedure</th>
                <th scope="col" className="py-2 pr-2 font-medium">Tooth</th>
                <th scope="col" className="py-2 font-medium">Target date</th>
              </tr>
            </thead>
            <tbody>
              {option.items.map((i, n) => {
                const p = byId.get(i.procedureId);
                return (
                  <tr key={i.procedureId} className="border-b border-line">
                    <td className="py-2 pr-2 text-muted">{n + 1}</td>
                    <td className="py-2 pr-2 font-mono">{p?.cdt}</td>
                    <td className="py-2 pr-2">
                      {p?.label}
                      {i.locked && <span className="ml-1.5 text-xs text-muted">(deadline set by dentist)</span>}
                    </td>
                    <td className="py-2 pr-2">{p?.tooth ? `#${p.tooth}` : '—'}</td>
                    <td className="py-2">{formatDate(i.date, { year: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Questions from your patient</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
          {questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </section>

      <p className="mt-6 text-xs text-muted">
        Dates are targets chosen around the patient's annual maximum. Clinical judgment comes first: please tell the patient if any
        item can't safely wait. Estimate rules version {rulesVersion}.
      </p>
    </article>
  );
}
