import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ReadDocument } from '../api';

type ForwardResult = Awaited<ReturnType<typeof api.simulateForward>>;
import { useAppStore } from '../store';
import { DemoDataPill } from './DemoDataPill';
import { InvoiceCheck } from './InvoiceCheck';
import { Section } from './Section';

/** F2 channel 2: forward what Lincoln can't see. No inbox access, ever: the member chooses what to send. */
export function ForwardingCard() {
  const personaId = useAppStore((s) => s.personaId);
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ['inbox', personaId], queryFn: () => api.getInbox() });
  // The demo panel's "Dentist emails a bill" stands in for SES inbound and leaves its result here.
  const forwarded = useQuery<ForwardResult | null>({ queryKey: ['forwarded', personaId], queryFn: () => null, enabled: false });
  const [approval, setApproval] = useState<{ for: unknown; doc?: ReadDocument }>();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inbox', personaId] });

  const approve = useMutation({
    mutationFn: ({ from, id }: { from: string; id: string }) => api.approveSender(from, id),
    onSuccess: (r) => {
      setApproval({ for: forwarded.data, doc: r.doc });
      refresh();
    },
  });

  const latest = forwarded.data;
  // An approval belongs to the email it released; a newer email replaces it.
  const approved = approval?.for === latest ? approval : undefined;
  const doc = approved ? approved.doc : latest?.doc;
  const note = approved
    ? approved.doc
      ? 'Sender added. The email was read and then deleted; only what Ting found is kept.'
      : 'Sender added.'
    : latest
      ? latest.status === 'held'
        ? (latest.reason ?? 'Held for your approval.')
        : latest.status === 'rejected'
          ? `Rejected: ${latest.reason}`
          : 'Received.'
      : '';

  return (
    <Section id="forwarding" title="Your forwarding address" actions={<DemoDataPill label="Simulated mail" />}>
      <p className="text-sm text-muted">
        For bills and receipts your insurer can&rsquo;t see. Forward an email, or set a filter in your own mail app. Ting never reads your inbox.
      </p>
      {inbox.data && (
        <p className="mt-2 font-mono text-sm">
          {inbox.data.address}
          <button type="button" className="btn-ghost ml-2 px-2 py-0.5 text-xs" onClick={() => void navigator.clipboard?.writeText(inbox.data.address)}>
            Copy
          </button>
        </p>
      )}
      {inbox.data?.senders.length ? <p className="mt-1 text-xs text-muted">Approved senders: {inbox.data.senders.join(', ')}</p> : null}

      {inbox.data?.held.map((h) => (
        <div key={h.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
          <span className="min-w-0 flex-1">
            We got an email from <strong>{h.from}</strong> (&ldquo;{h.subject}&rdquo;). Add it to your account?
          </span>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={approve.isPending} onClick={() => approve.mutate({ from: h.from, id: h.id })}>
            Add sender
          </button>
        </div>
      ))}

      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {doc?.kind === 'invoice' && doc.invoice && <InvoiceCheck invoice={doc.invoice} lineChecks={doc.lineChecks} />}
    </Section>
  );
}
