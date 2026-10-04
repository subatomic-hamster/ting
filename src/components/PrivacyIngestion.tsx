import { USE_MOCKS } from "../api";
import { describeRemoved, type PhiKind } from "../engine/phi";

type Deid = { removed: Partial<Record<PhiKind, number>>; preview: string };

/** Per document: what was removed before any AI read it, and the de-identified text the AI saw. */
export function DeidentifiedNote({ deidentified }: { deidentified?: Deid }) {
  if (!deidentified) return null;
  return (
    <div className="mt-1.5 rounded-lg bg-paper p-2 text-xs">
      <p className="font-medium">
        {describeRemoved({ text: "", removed: deidentified.removed })}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-muted">What the AI saw</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2">
          {deidentified.preview}
        </pre>
        {USE_MOCKS && (
          <p className="mt-1 text-muted">
            Offline demo: nothing left this device and no AI service was
            called. This is the text an AI would be given.
          </p>
        )}
      </details>
    </div>
  );
}

/** The short HIPAA explanation shown next to ingested documents. */
export function PrivacyIngestion() {
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-sm">
      <p className="font-semibold">How Ting handles your medical documents (HIPAA)</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
        <li>
          Before any AI reads a document or email, Ting removes the direct
          identifiers from HIPAA&rsquo;s Safe Harbor list: names, street
          addresses, phone numbers, email addresses, Social Security numbers,
          member IDs and birth dates.
        </li>
        <li>
          Service dates, procedure codes, tooth numbers and dollar amounts
          stay, because the plan math needs them. That makes it a limited data
          set.
        </li>
        <li>Your employer never sees your documents or claims.</li>
        <li>In production this runs under the carrier&rsquo;s Business Associate Agreement (BAA).</li>
      </ul>
    </div>
  );
}
