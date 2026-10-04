import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, USE_MOCKS } from '../../api';
import { useAppStore } from '../../store';

// Demo stand-ins for mail that would arrive by itself: emails to the Ting agent, a bill at the forwarding address,
// and the monthly overview that normally goes out on the 1st.

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

const FORWARDED_BILL = {
  from: 'billing@greensborofamilydental.example',
  subject: 'Your statement from Greensboro Family Dental',
  text: `Greensboro Family Dental
Statement / Invoice
Patient: Dale        Date of service: 10/03/2026
D3330   Root canal - molar   #19        $1,180.00
Insurance adjustment                     -$768.00
Amount due                                $412.00`,
};

export function EmailDemoControls() {
  const qc = useQueryClient();
  const personaId = useAppStore((s) => s.personaId);
  const [sample, setSample] = useState(SAMPLES[0]);
  const [text, setText] = useState(SAMPLES[0].text);

  const send = useMutation({
    mutationFn: () => api.emailAgent({ subject: sample.subject, text, fromDentist: sample.fromDentist }),
    onSuccess: () => {
      // The agent answers in a few seconds; the socket also signals when it's done.
      for (const ms of [6000, 12000, 20000]) setTimeout(() => void qc.invalidateQueries({ queryKey: ['received'] }), ms);
    },
  });
  const forward = useMutation({
    mutationFn: () => api.simulateForward(FORWARDED_BILL),
    onSuccess: (r) => {
      // The forwarding card on /email shows the result.
      qc.setQueryData(['forwarded', personaId], r);
      void qc.invalidateQueries({ queryKey: ['inbox', personaId] });
    },
  });
  const monthly = useMutation({
    mutationFn: () => api.sendMonthlyNow(),
    onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: ['outbox'] }), 1500),
  });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={sample.id === s.id}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${sample.id === s.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-amber-300 bg-white text-amber-900'}`}
            onClick={() => {
              setSample(s);
              setText(s.text);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <details className="text-[11px] text-amber-900">
        <summary className="cursor-pointer">Edit the email</summary>
        <textarea
          className="mt-1 block h-24 w-full rounded-lg border border-amber-300 bg-white p-1.5 font-mono text-[11px] text-ink"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Email body"
        />
      </details>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className="btn-primary px-2 py-1.5 text-xs" disabled={send.isPending || USE_MOCKS} onClick={() => send.mutate()}>
          {send.isPending ? 'Sending…' : send.isSuccess ? 'Sent to Ting' : 'Send to Ting'}
        </button>
        <button type="button" className="btn-secondary px-2 py-1.5 text-xs" disabled={forward.isPending} onClick={() => forward.mutate()}>
          {forward.isPending ? 'Sending…' : 'Dentist emails a bill'}
        </button>
        <button type="button" className="btn-secondary col-span-2 px-2 py-1.5 text-xs" disabled={monthly.isPending} onClick={() => monthly.mutate()}>
          {monthly.isPending ? 'Sending…' : monthly.data && !monthly.data.sent ? (monthly.data.reason ?? 'Not sent') : 'Send this month’s overview now'}
        </button>
      </div>
      {USE_MOCKS && <p className="text-[11px] text-amber-800">Emailing the agent needs the live API.</p>}
      {send.isError && <p className="text-[11px] text-warn">{send.error.message}</p>}
    </div>
  );
}
