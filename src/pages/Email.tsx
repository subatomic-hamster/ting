import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, USE_MOCKS, type Contact } from '../api';
import { DemoDataPill } from '../components/DemoDataPill';
import { PageHeader, Section } from '../components/Section';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore } from '../store';

const SAMPLES: {
  id: string;
  label: string;
  fromDentist?: boolean;
  subject: string;
  text: string;
}[] = [
  {
    id: 'xray',
    label: 'Dentist: urgent x-ray result',
    fromDentist: true,
    subject: 'Your x-ray results',
    text: "Hi, following up on today's x-rays. Tooth #14 has a deep cavity that has reached the nerve. We recommend a root canal followed by a porcelain crown on #14, within the next 3 weeks to avoid an infection. Quoted fees: root canal $1,180, crown $1,450.\n— Dr. Patel, College Hill Dental",
  },
  {
    id: 'eob',
    label: 'Insurer EOB (forwarded)',
    subject: 'Fwd: Your Explanation of Benefits',
    text: 'Acme Dental — Explanation of Benefits. This is not a bill.\nClaim number: C-2026-10-0587. Date of service: 10/01/2026. Provider: College Hill Dental.\nD1110 Prophylaxis adult — Billed $125.00 Allowed $90.00 Plan paid $90.00 You owe $0.00\nD0274 Bitewings, four films — Billed $85.00 Allowed $64.00 Plan paid $64.00 You owe $0.00',
  },
  {
    id: 'bill',
    label: "Dentist's bill",
    subject: 'Fwd: Statement from Greensboro Family Dental',
    text: 'Greensboro Family Dental — Statement / Invoice\nDate of service: 10/03/2026\nD3330 Root canal - molar #19   $1,180.00\nInsurance adjustment   -$768.00\nAmount due: $412.00',
  },
  {
    id: 'plan',
    label: 'Treatment plan',
    subject: 'Fwd: Proposed treatment',
    text: 'Proposed treatment plan from College Hill Dental:\n#3 D2392 composite filling, two surfaces — $210\n#30 D2740 porcelain crown — $1,450\nThe filling is routine; the crown can be done any time in the next six months.',
  },
  {
    id: 'notice',
    label: 'Plan notice: coverage change',
    subject: 'Important: changes to your dental coverage',
    text: 'Notice from Acme Manufacturing Benefits: effective November 1, 2026, your dental plan changes from Acme Dental Low to Acme Dental High because of a correction to your enrollment. Your monthly premium changes to $38.00. Contact HR within 10 days if this is wrong.',
  },
];

function EmailSettings() {
  const qc = useQueryClient();
  const personaId = useAppStore((s) => s.personaId);
  const info = useQuery({
    queryKey: ['contact', personaId],
    queryFn: () => api.getContact(),
  });
  const [form, setForm] = useState<Contact>({
    email: '',
    monthly: true,
    urgent: true,
    detail: 'detailed',
  });
  useEffect(() => {
    if (info.data?.contact) setForm(info.data.contact);
  }, [info.data]);
  const save = useMutation({
    mutationFn: (c: Contact) => api.setContact(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact'] }),
  });
  const monthly = useMutation({
    mutationFn: () => api.sendMonthlyNow(),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['outbox'] }), 1500),
  });

  return (
    <div className="space-y-3 text-sm">
      <p>
        Email anything about your dental care to <strong className="font-mono">{info.data?.agent ?? 'ting-dental@agentmail.to'}</strong>: EOBs, bills, treatment
        plans, notes from your dentist. Ting reads it, updates your record, plans any work and replies.
        {info.data && !info.data.live && (
          <span className="block text-xs text-muted">Demo: email isn&rsquo;t connected yet, so messages show in the outbox below.</span>
        )}
      </p>
      <form
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
          <input type="checkbox" checked={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.checked })} /> Monthly overview (1st of the month)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} /> Urgent alerts right away
        </label>
        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.detail === 'private'}
            onChange={(e) =>
              setForm({
                ...form,
                detail: e.target.checked ? 'private' : 'detailed',
              })
            }
          />
          <span>
            Private mode
            <span className="block text-xs text-muted">Emails only say there&rsquo;s an update; the details stay in the app.</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : 'Save'}
          </button>
          <button type="button" className="btn-secondary" disabled={monthly.isPending || !info.data?.contact} onClick={() => monthly.mutate()}>
            {monthly.isPending ? 'Sending…' : 'Send this month’s overview now'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Composer() {
  const qc = useQueryClient();
  const [sample, setSample] = useState(SAMPLES[0]);
  const [text, setText] = useState(SAMPLES[0].text);
  const send = useMutation({
    mutationFn: () =>
      api.emailAgent({
        subject: sample.subject,
        text,
        fromDentist: sample.fromDentist,
      }),
    onSuccess: () => {
      // The agent answers in a few seconds; the socket also signals when it's done.
      for (const ms of [6000, 12000, 20000]) setTimeout(() => void qc.invalidateQueries({ queryKey: ['received'] }), ms);
    },
  });
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rounded-full border px-2.5 py-1 text-xs ${sample.id === s.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white text-muted'}`}
            onClick={() => {
              setSample(s);
              setText(s.text);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        From: {sample.fromDentist ? 'your dentist’s office (approved sender)' : 'you'} · Subject: {sample.subject}
      </p>
      <textarea
        className="block h-32 w-full rounded-lg border border-line p-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Email body"
      />
      <button type="button" className="btn-primary" disabled={send.isPending || USE_MOCKS} onClick={() => send.mutate()}>
        {send.isPending ? 'Sending…' : send.isSuccess ? 'Sent to Ting' : 'Send to Ting'}
      </button>
      {send.isError && <p className="text-xs text-warn">{send.error.message}</p>}
    </div>
  );
}

function Received() {
  const personaId = useAppStore((s) => s.personaId);
  const docs = useQuery({
    queryKey: ['received', personaId],
    queryFn: () => api.getReceived(),
  });
  if (!docs.data?.length) return <p className="text-sm text-muted">Nothing yet. Email Ting a document and it shows up here.</p>;
  return (
    <ul className="space-y-3">
      {docs.data.map((d) => (
        <li key={d.docId} className={`rounded-xl border p-3 text-sm ${d.urgent ? 'border-red-200 bg-red-50' : 'border-line bg-white'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{d.subject || '(no subject)'}</span>
            <span className="text-xs text-muted">
              {d.role === 'dentist' ? 'from your dentist' : 'from you'} · {new Date(d.receivedAt).toLocaleString()}
            </span>
          </div>
          {d.urgent && (
            <p className="mt-1 text-xs font-semibold text-cost">
              Marked urgent
              {d.urgentP !== undefined && d.urgentP >= 0 ? ` (${Math.round(d.urgentP * 100)}% · ${d.urgentSource})` : ''}
            </p>
          )}
          {d.quarantined ? (
            <p className="mt-1 text-warn">Set aside: it seemed to contain instructions aimed at an AI.</p>
          ) : (
            d.record && (
              <>
                <p className="mt-1 text-muted">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{d.record.docType.replace(/_/g, ' ')}</span> {d.record.summary}
                </p>
                {d.record.procedures.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {d.record.procedures.map((p, i) => (
                      <li key={i}>
                        {p.label} — {p.status}
                        {p.urgency !== 'routine' && `, ${p.urgency}`}
                        {p.planPaid !== undefined && `, plan paid ${formatMoney(p.planPaid)}`}
                        {p.memberOwes !== undefined && `, you owe ${formatMoney(p.memberOwes)}`}
                        {p.billed !== undefined && p.planPaid === undefined && `, ${formatMoney(p.billed)}`}
                        {p.deadline && `, by ${formatDate(p.deadline, { year: true })}`}
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
                    Scheduled: {d.plan.items.map((i) => `${i.label} ${formatDate(i.date)} (${formatMoney(i.memberOwes)})`).join('; ')}
                    {d.plan.dentist && ` · ${d.plan.dentist.isCurrent ? 'with your dentist' : 'suggested'} ${d.plan.dentist.name}`}
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
    queryKey: ['outbox', personaId],
    queryFn: () => api.getOutbox(),
  });
  const [open, setOpen] = useState<string>();
  if (!mail.data?.length) return <p className="text-sm text-muted">No emails sent yet.</p>;
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
                className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.kind === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-muted'}`}
              >
                {m.kind}
              </span>
              <span className="font-medium">{m.subject}</span>
            </span>
            <span className="text-xs text-muted">
              to {m.to} · {m.delivered === 'agentmail' ? 'emailed' : 'outbox only'} · {new Date(m.at).toLocaleTimeString()}
            </span>
          </button>
          {open === m.at && <iframe title={m.subject} className="mt-2 h-[520px] w-full rounded-lg border border-line" sandbox="" srcDoc={m.html} />}
        </li>
      ))}
    </ul>
  );
}

/** Email: the agent's address, your settings, the demo composer, what Ting read and what it sent. */
export default function EmailPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Email" subtitle="Ting works over email: send it anything about your dental care; get a monthly overview and urgent alerts.">
        <DemoDataPill label="Demo mail" />
      </PageHeader>
      <Section title="Your email and alerts" id="settings">
        <EmailSettings />
      </Section>
      <Section title="Email Ting (demo composer)" id="compose">
        <Composer />
      </Section>
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
