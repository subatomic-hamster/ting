import { InvoiceCheck } from "./InvoiceCheck";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ReadDocument } from "../api";
import type { ServiceRecord } from "../engine/types";
import { intakeQuestions, toProcedures } from "../intake/questions";
import type { IntakeItem, IntakeQuestion } from "../intake/types";
import { formatMoney, groupVisits, visitName } from "../lib/format";
import { isSpeechSupported, listen } from "../lib/speech";
import { useAppStore, useProfile } from "../store";
import { CameraIcon, MicIcon } from "./Icons";

const EXAMPLES = [
  "Root canal and a crown on #19",
  "Braces for an adult",
  "Cleaning and X-rays",
];

interface Extra {
  previousDate: string;
  deadline: string;
  maybe: boolean;
  likelihood: number;
}

/** Text, voice and photo all end up as the same items; Ting only asks when a wrong guess would change the bill. */
export function IntakeBox({ initialText = "" }: { initialText?: string } = {}) {
  const profile = useProfile();
  const addProcedures = useAppStore((s) => s.addProcedures);
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [viaVoice, setViaVoice] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [doc, setDoc] = useState<ReadDocument>();
  const stopRef = useRef<() => void>(() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = isSpeechSupported();

  const questions = useMemo(
    () => intakeQuestions(items, profile),
    [items, profile],
  );
  const priced = useMemo(() => toProcedures(items, profile), [items, profile]);

  const review = (found: IntakeItem[], message: string) => {
    setItems(found);
    // A "maybe" read from the dentist's own wording (Winnow use 6) starts the slider there; the member can change it.
    setExtra(
      Object.fromEntries(
        found.map((i) => [
          i.id,
          {
            previousDate: "",
            deadline: "",
            maybe: i.likelihood !== undefined,
            likelihood: i.likelihood ?? 0.5,
          },
        ]),
      ),
    );
    setNote(
      found.length
        ? message
        : "We couldn't spot a procedure. Try words like crown, filling or cleaning.",
    );
  };

  const parse = useMutation({
    mutationFn: (t: string) => api.parseDescription(t),
    onSuccess: (found) => {
      review(
        viaVoice
          ? found.map((i) => ({ ...i, source: "voice" as const }))
          : found,
        `Found ${found.length} item${found.length === 1 ? "" : "s"}. Check them below.`,
      );
      setDoc(undefined);
      setText("");
      setViaVoice(false);
    },
    onError: (e) =>
      setNote(
        `Couldn't read that: ${e instanceof Error ? e.message : "unknown error"}`,
      ),
  });

  const upload = useMutation({
    mutationFn: (f: File) => api.readDocument(f),
    onSuccess: (r) => {
      setDoc(r);
      if (r.duplicate)
        setNote(
          "You've uploaded this file before. Ting won't count anything on it twice.",
        );
      else if (r.triage?.quarantined)
        setNote(
          "This file includes unrelated instructions. Review each extracted item against the original document.",
        );
      if (r.kind === "treatment_plan" && r.triage?.quarantined)
        review(
          r.items,
          `Found ${r.items.length} item(s) with Ting's own parser. Check them below.`,
        );
      else if (r.kind === "treatment_plan")
        review(
          r.items,
          `Read your treatment plan: found ${r.items.length} item${r.items.length === 1 ? "" : "s"}. Check them below.`,
        );
      else
        setNote(
          r.kind === "invoice"
            ? "This is a dentist's bill. Ting checks it against your insurer's EOB below."
            : r.kind === "plan_summary"
              ? "This looks like a benefits summary. Load it on the Plan rules page."
              : r.kind === "insurance_card"
                ? "This looks like an insurance card. Scan it on the Plan rules page."
                : "We couldn't find any procedures in that file. Try a sharper photo, or type the work instead.",
        );
    },
    onError: (e) =>
      setNote(
        `Couldn't read that file: ${e instanceof Error ? e.message : "unknown error"}`,
      ),
  });

  const toggleMic = () => {
    if (listening) {
      stopRef.current();
      return;
    }
    setListening(true);
    setViaVoice(true);
    stopRef.current = listen({
      onText: (t) => setText(t),
      onEnd: () => setListening(false),
      onError: (m) => setNote(m),
    });
  };

  const answer = (q: IntakeQuestion, value: string) =>
    setItems((xs) =>
      xs.map((i) =>
        // A code answer covers the whole appointment ("3 fillings" are the same kind of filling).
        i.id !== q.itemId &&
        !(
          q.field === "cdt" &&
          i.visit &&
          i.visit === xs.find((x) => x.id === q.itemId)?.visit
        )
          ? i
          : q.field === "cdt"
            ? { ...i, candidates: [{ cdt: value, p: 1 }] }
            : q.field === "tooth"
              ? { ...i, teeth: [{ tooth: Number(value), p: 1 }] }
              : { ...i, replacement: value === "yes" ? 1 : 0 },
      ),
    );

  const add = () => {
    if (
      items.some(
        (i) => i.fee !== undefined && (!Number.isFinite(i.fee) || i.fee <= 0),
      )
    ) {
      setNote("Enter a positive dentist fee for every quoted item.");
      return;
    }
    if (
      Object.values(extra).some(
        (e) =>
          e.maybe &&
          (!Number.isFinite(e.likelihood) ||
            e.likelihood < 0.05 ||
            e.likelihood > 0.95),
      )
    ) {
      setNote("Likelihood must be between 5% and 95%.");
      return;
    }
    if (
      Object.values(extra).some(
        (e) => e.previousDate && e.previousDate > profile.asOf,
      )
    ) {
      setNote("A previous treatment date cannot be in the future.");
      return;
    }

    if (priced.length !== items.length) {
      setNote("Enter a dentist fee for every item before adding it.");
      return;
    }
    const procs = priced.map((p) => {
      const e = extra[p.id];
      return {
        ...p,
        ...((items.find((i) => i.id === p.id)?.replacement ?? 0) >= 0.5 &&
        !e?.previousDate
          ? { historyPending: true }
          : {}),
        deadline: e?.deadline || undefined,
        likelihood: e?.maybe ? e.likelihood : undefined,
      };
    });
    // A replaced crown counts against the "1 per tooth per 5 years" limit from when it was placed.
    const replaced: ServiceRecord[] = items
      .filter((i) => (i.replacement ?? 0) >= 0.5)
      .flatMap((i) => {
        const p = priced.find((x) => x.id === i.id);
        return p && extra[i.id]?.previousDate
          ? [
              {
                date: extra[i.id].previousDate,
                cdt: p.cdt,
                tooth: p.tooth,
                planPaid: 0,
                source: "user" as const,
              },
            ]
          : [];
      });
    const error = addProcedures(procs, replaced);
    if (error) {
      setNote(`Can't schedule that: ${error}. Check the deadlines.`);
      return;
    }
    setNote(
      `Added ${procs.length} item${procs.length === 1 ? "" : "s"} to your plan.`,
    );
    setItems([]);
    setDoc(undefined);
  };

  const busy = parse.isPending || upload.isPending;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) parse.mutate(text);
        }}
      >
        <label htmlFor="intake-text" className="text-sm font-medium">
          Describe the dental work you've been told you need
        </label>
        <div className="mt-1.5 rounded-xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            id="intake-text"
            rows={2}
            className="block w-full resize-none rounded-t-xl bg-transparent px-3 py-2.5 text-base outline-none sm:text-sm"
            placeholder='e.g. "Root canal on #19, then a buildup and a crown"'
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setViaVoice(false);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-2">
            <button
              type="button"
              className={`btn-secondary px-2.5 py-1.5 ${listening ? "border-cost text-cost" : ""}`}
              onClick={toggleMic}
              disabled={!speech}
              aria-pressed={listening}
              title={
                speech
                  ? "Speak instead of typing"
                  : "Voice input isn't supported in this browser"
              }
            >
              <MicIcon /> {listening ? "Listening… tap to stop" : "Speak"}
            </button>
            <button
              type="button"
              className="btn-secondary px-2.5 py-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <CameraIcon /> Photo of treatment plan
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.txt"
              capture="environment"
              className="sr-only"
              aria-label="Upload a photo of your treatment plan"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <button
              type="submit"
              className="btn-primary ml-auto px-3 py-1.5"
              disabled={busy || !text.trim()}
            >
              {parse.isPending ? "Reading…" : "Find procedures"}
            </button>
          </div>
        </div>
      </form>

      <details className="mt-4 border-t border-line">
        <summary>Example descriptions</summary>
        <div className="flex flex-col" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-brand-500 hover:text-ink"
              onClick={() => setText(ex)}
            >
              {ex}
            </button>
          ))}
          <a
            href="/samples/treatment-plan.png"
            download
            className="px-1 text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Sample treatment plan photo
          </a>
        </div>
      </details>

      <p className="mt-2 min-h-5 text-sm text-muted" aria-live="polite">
        {upload.isPending ? "Reading your document…" : note}
        {doc &&
          (doc.kind === "plan_summary" || doc.kind === "insurance_card") && (
            <Link
              to="/plan"
              className="ml-1 font-medium text-brand-700 underline"
            >
              Open Plan rules
            </Link>
          )}
      </p>

      {doc?.kind === "invoice" && doc.invoice && (
        <InvoiceCheck invoice={doc.invoice} lineChecks={doc.lineChecks} />
      )}

      {doc?.text && (
        <details className="mt-1 text-xs text-muted">
          <summary className="cursor-pointer">
            Text Ting read from the file
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-paper p-2 whitespace-pre-wrap">
            {doc.text}
          </pre>
          {doc.unrecognized.length > 0 && (
            <p className="mt-1 text-warn">
              Codes Ting doesn't know yet: {doc.unrecognized.join(", ")}
            </p>
          )}
        </details>
      )}

      {items.length > 0 && (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          {questions.map((q) => (
            <fieldset
              key={q.itemId + q.field}
              className="min-w-0 border-l-2 border-warn pl-3"
            >
              <legend className="px-1 text-sm font-medium">{q.prompt}</legend>
              <p className="text-xs text-muted">
                <span className="font-semibold">Why we're asking:</span> {q.why}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="btn-secondary px-2.5 py-1 text-xs"
                    onClick={() => answer(q, o.value)}
                  >
                    {o.label}
                    <span className="text-muted">
                      {" "}
                      Estimated amount you pay: {formatMoney(o.owes)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}

          <ul className="space-y-2">
            {groupVisits(items).map((group) => {
              // One row per appointment: "3 fillings" is one visit, so its deadline and "maybe" apply to all of it.
              const i = group[0];
              const ps = group.flatMap((g) =>
                priced.filter((x) => x.id === g.id),
              );
              const p = ps[0];
              const e = extra[i.id];
              const set = (patch: Partial<Extra>) =>
                setExtra((x) => ({
                  ...x,
                  ...Object.fromEntries(
                    group.map((g) => [g.id, { ...x[g.id], ...patch }]),
                  ),
                }));

              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {ps.length ? visitName(ps) : i.phrase}
                    </span>{" "}
                    <div className="text-xs text-muted">
                      from "{i.phrase}" ·{" "}
                      {p
                        ? `fee ${formatMoney(p.fee)}${ps.length > 1 ? " each · one visit" : ""}`
                        : "Dentist fee needed"}
                    </div>
                  </div>
                  <label className="block w-full">
                    Dentist fee ($), per item
                    <input
                      type="number"
                      min="0.01"
                      max="1000000"
                      step="0.01"
                      value={i.fee ?? ""}
                      placeholder={p ? String(p.fee) : "Enter quote"}
                      className="mt-1 block w-full border border-line px-3 py-2"
                      onChange={(ev) =>
                        setItems((xs) =>
                          xs.map((x) =>
                            group.some((g) => g.id === x.id)
                              ? {
                                  ...x,
                                  fee: ev.target.value
                                    ? Number(ev.target.value)
                                    : undefined,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  {(i.replacement ?? 0) >= 0.5 && (
                    <label className="block w-full">
                      When was the old crown placed? (if known)
                      <input
                        type="date"
                        max={profile.asOf}
                        value={e?.previousDate ?? ""}
                        onChange={(ev) =>
                          set({ previousDate: ev.target.value })
                        }
                        className="mt-1 block w-full border border-line px-3 py-2"
                      />
                      <span className="mt-2 block text-xs text-muted">
                        If unknown, budget the full fee until your insurer
                        confirms replacement eligibility.
                      </span>
                    </label>
                  )}
                  <label className="flex flex-wrap items-center gap-2 text-base text-muted">
                    Dentist's deadline
                    <input
                      type="date"
                      className="min-w-0 w-full rounded-lg border border-line px-1.5 py-1 text-ink"
                      value={e?.deadline ?? ""}
                      min={profile.asOf}
                      onChange={(ev) => set({ deadline: ev.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={e?.maybe ?? false}
                      onChange={(ev) => set({ maybe: ev.target.checked })}
                    />
                    Only maybe
                  </label>
                  {e?.maybe && (
                    <input
                      type="number"
                      min={5}
                      max={95}
                      step={5}
                      aria-label="Likelihood percent"
                      className="w-16 rounded-lg border border-line px-1.5 py-1 text-xs"
                      value={Math.round(e.likelihood * 100)}
                      onChange={(ev) =>
                        set({ likelihood: Number(ev.target.value) / 100 })
                      }
                    />
                  )}
                  {e?.maybe && i.likelihoodFrom === "notes" && (
                    <span className="text-xs text-muted">
                      from your dentist&rsquo;s notes
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            Only your dentist sets deadlines. Ting never schedules anything
            after one.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={add}
              disabled={!priced.length || priced.length !== items.length}
            >
              Add to plan
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setItems([])}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
