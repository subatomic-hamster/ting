import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, USE_MOCKS } from "../../api";
import { memberFor } from "../../data/members";
import { sampleEmails, type SampleEmail } from "../../engine/sampleEmails";
import { useAppStore } from "../../store";

// Stand-ins for mail that would arrive by itself: emails to the Ting agent, a bill at the forwarding address,
// and the monthly overview that normally goes out on the 1st. Work in both transports (live API and in-browser agent).

type Option = Omit<SampleEmail, "id"> & { id: string };

const NOTICE: Option = {
  id: "notice",
  label: "Plan notice: coverage change",
  hint: "",
  subject: "Important: changes to your dental coverage",
  text: "Notice from Acme Manufacturing Benefits: effective November 1, 2026, your dental plan changes from Acme Dental Low to Acme Dental High because of a correction to your enrollment. Your monthly premium changes to $38.00. Contact HR within 10 days if this is wrong.",
};

const FORWARDED_BILL = {
  from: "billing@greensborofamilydental.example",
  subject: "Your statement from Greensboro Family Dental",
  text: `Greensboro Family Dental
Statement / Invoice
Patient: Dale        Date of service: 10/03/2026
D3330   Root canal - molar   #19        $1,180.00
Insurance adjustment                     -$768.00
Amount due                                $412.00`,
};

/** Refreshes what the Email page shows once the agent has answered (at once in the browser; a few seconds live). */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    const go = () => {
      for (const k of ["received", "outbox", "profile", "carrier"]) void qc.invalidateQueries({ queryKey: [k] });
    };
    go();
    if (!USE_MOCKS) for (const ms of [6000, 12000, 20000]) setTimeout(go, ms);
  };
}

function useSamples(): SampleEmail[] {
  const personaId = useAppStore((s) => s.personaId);
  const profile = useAppStore((s) => s.profile);
  return useMemo(() => sampleEmails(memberFor(personaId), profile, profile.asOf), [personaId, profile]);
}

/** One-tap emails and notifications for the Email page; no hidden demo panel needed. */
export function TryItSamples() {
  const samples = useSamples();
  const refresh = useRefresh();
  const [last, setLast] = useState("");
  const send = useMutation({
    mutationFn: (s: SampleEmail) => api.emailAgent({ subject: s.subject, text: s.text, fromDentist: s.fromDentist }),
    onSuccess: (_r, s) => {
      setLast(`Ting read "${s.subject}". See "What Ting read" and "What Ting sent" below.`);
      refresh();
    },
  });
  const monthly = useMutation({
    mutationFn: () => api.sendMonthlyNow(),
    onSuccess: (r) => {
      setLast(r.sent ? "This month's overview was sent. See “What Ting sent” below." : (r.reason ?? "Not sent"));
      refresh();
    },
  });
  const busy = send.isPending || monthly.isPending;
  const urgent = samples.find((s) => s.id === "alert");
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">Email Ting something</p>
        <div className="mt-1.5 grid gap-1.5">
          {samples
            .filter((s) => s.id !== "alert")
            .map((s) => (
              <button key={s.id} type="button" className="btn-secondary justify-start px-3 py-2 text-left" disabled={busy} onClick={() => send.mutate(s)}>
                <span>
                  {s.label}
                  <span className="block text-xs font-normal text-muted">{s.hint}</span>
                </span>
              </button>
            ))}
        </div>
      </div>
      <div>
        <p className="font-medium">Notifications Ting sends</p>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          <button type="button" className="btn-secondary px-3 py-2" disabled={busy} onClick={() => monthly.mutate()}>
            Send this month&rsquo;s overview now
          </button>
          <button type="button" className="btn-secondary px-3 py-2" disabled={busy || !urgent} onClick={() => urgent && send.mutate(urgent)}>
            Show an urgent alert example
          </button>
        </div>
      </div>
      <p className="min-h-5 text-xs text-muted" role="status">
        {busy ? "Ting is reading it…" : last}
      </p>
      {(send.isError || monthly.isError) && <p className="text-xs text-warn" role="alert">{(send.error ?? monthly.error)?.message}</p>}
    </div>
  );
}

export function EmailDemoControls() {
  const qc = useQueryClient();
  const personaId = useAppStore((s) => s.personaId);
  const refresh = useRefresh();
  const samples = useSamples();
  const options = useMemo<Option[]>(() => [...samples, NOTICE], [samples]);
  const [pick, setPick] = useState<string>("eob");
  const sample = options.find((s) => s.id === pick) ?? options[0];
  const [edited, setEdited] = useState<{ id: string; text: string }>();
  const text = edited?.id === sample.id ? edited.text : sample.text;

  const send = useMutation({
    mutationFn: () => api.emailAgent({ subject: sample.subject, text, fromDentist: sample.fromDentist }),
    onSuccess: refresh,
  });
  const forward = useMutation({
    mutationFn: () => api.simulateForward(FORWARDED_BILL),
    onSuccess: (r) => {
      qc.setQueryData(["forwarded", personaId], r);
      void qc.invalidateQueries({ queryKey: ["inbox", personaId] });
    },
  });
  const monthly = useMutation({ mutationFn: () => api.sendMonthlyNow(), onSuccess: refresh });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {options.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={sample.id === s.id}
            className={`rounded-full border px-2 py-0.5 text-xs ${sample.id === s.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-amber-300 bg-white text-amber-900"}`}
            onClick={() => setPick(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <details className="text-xs text-amber-900">
        <summary className="cursor-pointer">Edit the email</summary>
        <textarea
          className="mt-1 block h-24 w-full rounded-lg border border-amber-300 bg-white p-1.5 font-mono text-xs text-ink"
          value={text}
          onChange={(e) => setEdited({ id: sample.id, text: e.target.value })}
          aria-label="Email body"
        />
      </details>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className="btn-primary px-2 py-1.5 text-xs" disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? "Sending…" : send.isSuccess ? "Sent to Ting" : "Send to Ting"}
        </button>
        <button type="button" className="btn-secondary px-2 py-1.5 text-xs" disabled={forward.isPending} onClick={() => forward.mutate()}>
          {forward.isPending ? "Sending…" : "Dentist emails a bill"}
        </button>
        <button type="button" className="btn-secondary col-span-2 px-2 py-1.5 text-xs" disabled={monthly.isPending} onClick={() => monthly.mutate()}>
          {monthly.isPending ? "Sending…" : monthly.data && !monthly.data.sent ? (monthly.data.reason ?? "Not sent") : "Send this month’s overview now"}
        </button>
      </div>
      {send.isError && <p className="text-xs text-warn">{send.error.message}</p>}
    </div>
  );
}
