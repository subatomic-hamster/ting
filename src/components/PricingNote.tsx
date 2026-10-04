import resources from "../data/dental-resources.json";
import type { AdjudicatedLine } from "../engine/types";
export function PricingNote({ line }: { line: AdjudicatedLine }) {
  const article = resources.library.articles.find((a) =>
    a.codes.includes(line.cdt),
  );
  return (
    <aside aria-label="Pricing sources" className="mt-4 text-base">
      {line.pricingWarning && (
        <p className="border-l-2 border-warn pl-3">{line.pricingWarning}</p>
      )}
      <details className="mt-3 border-t border-line">
        <summary className="text-brand-700">Price sources</summary>
        <p className="text-xs text-muted">
          Dentist fee: {line.feeSource?.label ?? "Source unconfirmed"}. Insurer
          allowance: {line.allowanceSource?.label ?? "Source unconfirmed"}.
        </p>
        <div className="mt-3 flex flex-col">
          <a
            className="flex min-h-12 items-center text-brand-700 underline"
            href={article?.url ?? resources.library.url}
            target="_blank"
            rel="noreferrer"
          >
            About this procedure
          </a>
          <a
            className="flex min-h-12 items-center text-brand-700 underline"
            href={resources.fairHealth.url}
            target="_blank"
            rel="noreferrer"
          >
            Check local cost benchmarks
          </a>
        </div>
      </details>
    </aside>
  );
}
