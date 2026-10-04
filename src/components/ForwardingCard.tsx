import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ReadDocument } from '../api';
import { useAppStore } from '../store';
import { DemoDataPill } from './DemoDataPill';
import { InvoiceCheck } from './InvoiceCheck';
import { Section } from './Section';

const DEMO_SENDER = 'billing@greensborofamilydental.example';
const DEMO_BILL = `Greensboro Family Dental
Statement / Invoice
Patient: Dale        Date of service: 10/03/2026
D3330   Root canal - molar   #19        $1,180.00
Insurance adjustment                     -$768.00
Amount due                                $412.00`;

/** F2 channel 2: forward what Lincoln can't see. No inbox access, ever: the member chooses what to send. */
export function ForwardingCard() {
  const personaId = useAppStore((s) => s.personaId);
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ['inbox', personaId], queryFn: () => api.getInbox() });
  const [doc, setDoc] = useState<ReadDocument>();
  const [note, setNote] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inbox', personaId] });

  const forward = useMutation({
    mutationFn: () => api.simulateForward({ from: DEMO_SENDER, subject: 'Your statement from Greensboro Family Dental', text: DEMO_BILL }),
    onSuccess: (r) => {
      setDoc(r.doc);
      setNote(r.status === 'held' ? (r.reason ?? 'Held for your approval.') : r.status === 'rejected' ? `Rejected: ${r.reason}` : 'Received.');
      refresh();
    },
  });
  const approve = useMutation({
    mutationFn: ({ from, id }: { from: string; id: string }) => api.approveSender(from, id),
    onSuccess: (r) => {
      setDoc(r.doc);
      setNote(r.doc ? 'Sender added. The email was read and then deleted; only what Ting found is kept.' : 'Sender added.');
      refresh();
    },
  });

  return (
    <Section id="forwarding" title="Your forwarding address" actions={<DemoDataPill label="Simulated mail" />}>
      <p className="text-sm text-muted">
        For bills and receipts Lincoln can&rsquo;t see. Forward an email, or set a filter in your own mail app. Ting never reads your inbox.
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

      <button type="button" className="btn-secondary mt-3 px-2.5 py-1.5 text-xs" onClick={() => forward.mutate()} disabled={forward.isPending}>
        {forward.isPending ? 'Sending…' : 'Demo: the dentist emails a bill'}
      </button>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {doc?.kind === 'invoice' && doc.invoice && <InvoiceCheck invoice={doc.invoice} lineChecks={doc.lineChecks} />}
    </Section>
  );
}
