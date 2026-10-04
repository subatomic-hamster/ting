import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Contact } from "../api";
import { DemoDataPill } from "../components/DemoDataPill";
import { ForwardingCard } from "../components/ForwardingCard";
import { PageHeader, Section } from "../components/Section";
import { formatDate, formatMoney } from "../lib/format";
import { useAppStore } from "../store";

function EmailSettings() {
  const qc = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const personaId = useAppStore((s) => s.personaId);
  const info = useQuery({
    queryKey: ["contact", personaId],
    queryFn: () => api.getContact(),
  });
  const [form, setForm] = useState<Contact>({
    email: "",
    monthly: true,
    urgent: true,
    detail: "private",
  });
  useEffect(() => {
    if (info.data?.contact && !dirty) setForm(info.data.contact);
  }, [info.data, dirty]);
  const save = useMutation({
    mutationFn: (c: Contact) => api.setContact(c),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["contact"] });
    },
  });

  return (
    <div className="space-y-3 text-sm">
      <p>
        Use the care-update address{" "}
        <strong className="font-mono">
          {info.data?.agent ?? "Loading address…"}
        </strong>{" "}
        for EOBs, bills, treatment plans, notes from your dentist. Ting reads
        it, updates your record, plans any work and replies.
        {info.data && !info.data.live && (
          <span className="block text-xs text-muted">
            Demo: email isn&rsquo;t connected here, so messages show under
            &ldquo;What Ting sent&rdquo;.
          </span>
        )}
      </p>
      <form
        onChange={() => setDirty(true)}
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <label className="block sm:col-span-2">
          <span className="font-medium">Your email</span>
          <input
            type="email"
            required
            className="mt-1 block w-full rounded-lg border border-line px-3 py-2"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-label="Your email address"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.monthly}
            onChange={(e) => setForm({ ...form, monthly: e.target.checked })}
          />{" "}
          Monthly overview (1st of the month)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.urgent}
            onChange={(e) => setForm({ ...form, urgent: e.target.checked })}
          />{" "}
          Urgent alerts right away
        </label>
        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.detail === "private"}
            onChange={(e) =>
              setForm({
                ...form,
                detail: e.target.checked ? "private" : "detailed",
              })
            }
          />
          <span>
            Private mode
            <span className="block text-xs text-muted">
              Emails only say there&rsquo;s an update; the details stay in the
              app.
            </span>
          </span>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : save.isSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </form>
      {save.isError && (
        <p role="alert">
          Could not save your email settings. Please try again.
        </p>
      )}
      {info.isError && <p role="alert">Could not load your email settings.</p>}
    </div>
  );
}

function Received() {
  const personaId = useAppStore((s) => s.personaId);
  const docs = useQuery({
    queryKey: ["received", personaId],
    queryFn: () => api.getReceived(),
  });
  if (docs.isPending) return <p role="status">Loading received documents…</p>;
  if (docs.isError)
    return (
      <p role="alert">
        Could not load documents.{" "}
        <button className="btn-secondary" onClick={() => void docs.refetch()}>
          Try again
        </button>
      </p>
    );
  if (!docs.data?.length)
    return (
      <p className="text-sm text-muted">
        Nothing yet. Email Ting a document and it shows up here.
      </p>
    );
  return (
    <ul className="space-y-3">
      {docs.data.map((d) => (
        <li
          key={d.docId}
          className={`rounded-xl border p-3 text-sm ${d.urgent ? "border-cost/30 bg-cost/10" : "border-line bg-white"}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{d.subject || "(no subject)"}</span>
            <span className="text-xs text-muted">
              {d.role === "dentist" ? "from your dentist" : "from you"} ·{" "}
              {new Date(d.receivedAt).toLocaleString()}
            </span>
          </div>
          {d.urgent && (
            <p className="mt-1 text-xs font-semibold text-cost">
              Marked urgent
            </p>
          )}
          {d.quarantined ? (
            <p className="mt-1 text-warn">
              Set aside: the document included unrelated instructions.
            </p>
          ) : (
            d.record && (
              <>
                <p className="mt-1 text-muted">
                  <span className="rounded bg-paper px-1.5 py-0.5 text-xs">
                    {d.record.docType.replace(/_/g, " ")}
                  </span>{" "}
                  {d.record.summary}
                </p>
                {d.record.procedures.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {d.record.procedures.map((p, i) => (
                      <li key={i}>
                        {p.label} . {p.status}
                        {p.urgency !== "routine" && `, ${p.urgency}`}
                        {p.planPaid !== undefined &&
                          `, plan paid ${formatMoney(p.planPaid)}`}
                        {p.memberOwes !== undefined &&
                          `, you owe ${formatMoney(p.memberOwes)}`}
                        {p.billed !== undefined &&
                          p.planPaid === undefined &&
                          `, ${formatMoney(p.billed)}`}
                        {p.deadline &&
                          `, by ${formatDate(p.deadline, { year: true })}`}
                      </li>
                    ))}
                  </ul>
                )}
                {[...(d.recorded ?? []), ...(d.flags ?? [])].map((r) => (
                  <p key={r} className="mt-1 text-xs">
                    {r}
                  </p>
                ))}
                {d.plan?.items.length ? (
                  <p className="mt-1 text-xs text-muted">
                    Scheduled:{" "}
                    {d.plan.items
                      .map(
                        (i) =>
                          `${i.label} ${formatDate(i.date)} (${formatMoney(i.memberOwes)})`,
                      )
                      .join("; ")}
                    {d.plan.dentist &&
                      ` · ${d.plan.dentist.isCurrent ? "with your dentist" : "suggested"} ${d.plan.dentist.name}`}
                  </p>
                ) : null}
              </>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

function Outbox() {
  const personaId = useAppStore((s) => s.personaId);
  const mail = useQuery({
    queryKey: ["outbox", personaId],
    queryFn: () => api.getOutbox(),
  });
  const [open, setOpen] = useState<string>();
  if (mail.isPending) return <p role="status">Loading messages…</p>;
  if (mail.isError)
    return (
      <p role="alert">
        Could not load messages.{" "}
        <button className="btn-secondary" onClick={() => void mail.refetch()}>
          Try again
        </button>
      </p>
    );
  if (!mail.data?.length)
    return <p className="text-sm text-muted">No emails sent yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
      {mail.data.map((m) => (
        <li key={m.at} className="p-3 text-sm">
          <button
            type="button"
            className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
            onClick={() => setOpen(open === m.at ? undefined : m.at)}
          >
            <span>
              <span
                className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${m.kind === "urgent" ? "bg-cost/10 text-cost" : "bg-paper text-muted"}`}
              >
                {m.kind}
              </span>
              <span className="font-medium">{m.subject}</span>
            </span>
            <span className="text-xs text-muted">
              to {m.to} ·{" "}
              {m.delivered === "agentmail" ? "emailed" : "outbox only"} ·{" "}
              {new Date(m.at).toLocaleTimeString()}
            </span>
          </button>
          {open === m.at && (
            <iframe
              title={m.subject}
              className="mt-2 h-[520px] w-full rounded-lg border border-line"
              sandbox=""
              srcDoc={m.html}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Email: the agent's address, your settings, the forwarding address, what Ting read and what it sent. Sample mail is in the demo panel. */
export default function EmailPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Email"
        subtitle="Ting works over email: send it anything about your dental care; get a monthly overview and urgent alerts."
      >
        <DemoDataPill label="Demo mail" />
      </PageHeader>
      <Section title="Your email and alerts" id="settings">
        <EmailSettings />
      </Section>
      <ForwardingCard />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="What Ting read" id="received">
          <Received />
        </Section>
        <Section title="What Ting sent" id="outbox">
          <Outbox />
        </Section>
      </div>
    </div>
  );
}
