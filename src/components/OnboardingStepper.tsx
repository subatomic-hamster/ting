import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { procedureFromCdt } from '../fixtures/feeSchedule';
import { useAppStore } from '../store';

const CLEANING = ['Less than 6 months ago', '6–12 months ago', 'Over a year ago', 'Not sure'];
const COVERED = ['Just me', 'Me + spouse/partner', 'Me + kids', 'My whole family'];

export function OnboardingStepper() {
  const [step, setStep] = useState(0);
  const [work, setWork] = useState('');
  const [cleaning, setCleaning] = useState<string>();
  const [covered, setCovered] = useState<string>();
  const addProcedures = useAppStore((s) => s.addProcedures);
  const navigate = useNavigate();

  const finish = useMutation({
    mutationFn: async () => {
      const parsed = work.trim() ? await api.parseDescription(work) : { items: [] };
      const extra = cleaning && cleaning !== CLEANING[0] ? [procedureFromCdt('D1110', { id: `p-clean-${Date.now()}`, source: 'typed', confidence: 1 })] : [];
      return [...parsed.items, ...extra];
    },
    onSuccess: (items) => {
      if (items.length) addProcedures(items);
      navigate('/treatment');
    },
  });

  const steps = [
    {
      title: 'Is any dental work planned?',
      why: "So we can price it before you're in the chair and find the cheapest time to do it.",
      valid: true,
      body: (
        <div>
          <label htmlFor="ob-work" className="sr-only">
            Planned dental work
          </label>
          <textarea
            id="ob-work"
            rows={3}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm"
            placeholder='e.g. "My dentist said I need a crown on #19" — or leave blank'
            value={work}
            onChange={(e) => setWork(e.target.value)}
          />
        </div>
      ),
    },
    {
      title: 'When was your last cleaning?',
      why: 'Most plans cover two cleanings a year at 100%. We will flag one that is waiting for you.',
      valid: Boolean(cleaning),
      body: <Choices options={CLEANING} value={cleaning} onChange={setCleaning} name="cleaning" />,
    },
    {
      title: "Who's covered by your plan?",
      why: 'Each person has their own annual maximum, and a family can share one deductible.',
      valid: Boolean(covered),
      body: <Choices options={COVERED} value={covered} onChange={setCovered} name="covered" />,
    },
  ];
  const s = steps[step];

  return (
    <div className="card mx-auto max-w-xl">
      <ol className="mb-4 flex gap-1.5" aria-label="Progress">
        {steps.map((x, i) => (
          <li key={x.title} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-slate-200'}`}>
            <span className="sr-only">
              Step {i + 1} {i < step ? '(done)' : i === step ? '(current)' : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="eyebrow">
        Question {step + 1} of {steps.length}
      </p>
      <h2 className="mt-1 text-xl font-semibold">{s.title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        <span className="font-semibold">Why we're asking:</span> {s.why}
      </p>
      {s.body}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost" onClick={() => setStep((n) => n - 1)} disabled={step === 0}>
          Back
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn-primary" onClick={() => setStep((n) => n + 1)} disabled={!s.valid}>
            Next
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => finish.mutate()} disabled={!s.valid || finish.isPending}>
            {finish.isPending ? 'Building your plan…' : 'See my costs'}
          </button>
        )}
      </div>
    </div>
  );
}

function Choices({ options, value, onChange, name }: { options: string[]; value?: string; onChange: (v: string) => void; name: string }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">{name}</legend>
      {options.map((o) => (
        <label
          key={o}
          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
            value === o ? 'border-brand-500 bg-brand-50 font-medium' : 'border-line hover:border-brand-200'
          }`}
        >
          <input type="radio" name={name} className="accent-brand-600" checked={value === o} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </fieldset>
  );
}
