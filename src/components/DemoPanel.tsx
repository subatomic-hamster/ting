import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, USE_MOCKS } from '../api';
import { PERSONA_IDS, PERSONAS } from '../data/personas';
import { yearOf } from '../lib/dates';
import { formatDate } from '../lib/format';
import { useHabitStore } from '../habits/store';
import { useAppStore } from '../store';
import { CloseIcon } from './Icons';

function initiallyOpen() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export function DemoPanel() {
  const [open, setOpen] = useState(initiallyOpen);
  const personaId = useAppStore((s) => s.personaId);
  const asOf = useAppStore((s) => s.profile.asOf);
  const today = useAppStore((s) => s.today);
  const loadPersona = useAppStore((s) => s.loadPersona);
  const simulateDec1 = useAppStore((s) => s.simulateDec1);
  const setAsOf = useAppStore((s) => s.setAsOf);
  const reset = useAppStore((s) => s.reset);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fire = useMutation({ mutationFn: () => api.fireMockClaim(useAppStore.getState().profile) });
  const brushNow = useHabitStore((s) => s.brushNow);
  const brushing = useHabitStore((s) => s.live?.state === 'running');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <aside
      aria-label="Demo controls"
      className="no-print fixed right-3 bottom-3 left-3 z-30 rounded-2xl border border-amber-300 bg-amber-50/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:w-80"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-900">Demo panel</h2>
        <button type="button" className="rounded p-1 text-amber-900 hover:bg-amber-100" onClick={() => setOpen(false)} aria-label="Hide demo panel">
          <CloseIcon />
        </button>
      </div>
      <p className="mb-2 text-xs text-amber-900">
        As of <strong>{formatDate(asOf, { year: true })}</strong>
        {asOf !== today && ' (simulated)'} · {USE_MOCKS ? 'mock API' : 'live API'}
      </p>

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs font-semibold text-amber-900">Persona</legend>
        <div className="grid grid-cols-3 gap-1">
          {PERSONA_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={personaId === id}
              onClick={() => loadPersona(id)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                personaId === id ? 'border-amber-600 bg-amber-200 text-amber-950' : 'border-amber-300 bg-white text-amber-900'
              }`}
              title={PERSONAS[id].blurb}
            >
              {PERSONAS[id].name}, {PERSONAS[id].age}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <button type="button" className="btn-secondary px-2 py-1.5 text-xs" onClick={() => setAsOf(`${yearOf(today)}-11-01`)}>
          Simulate Nov 1
        </button>
        <button type="button" className="btn-secondary px-2 py-1.5 text-xs" onClick={simulateDec1}>
          Simulate Dec 1
        </button>
        <button
          type="button"
          className="btn-primary px-2 py-1.5 text-xs"
          disabled={fire.isPending}
          onClick={() => fire.mutate()}
        >
          {fire.isPending ? 'Sending…' : fire.isError ? 'Nothing left to claim' : 'Fire mock claim'}
        </button>
        <button type="button" className="btn-secondary px-2 py-1.5 text-xs" disabled={brushing} onClick={brushNow}>
          {brushing ? 'Brushing…' : 'Brush now'}
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          onClick={() => {
            reset();
            void api.resetDemo().finally(() => queryClient.invalidateQueries());
            navigate('/');
          }}
        >
          Reset
        </button>
      </div>
      <p className="mt-2 text-[11px] text-amber-800">Ctrl+Shift+D toggles this panel.</p>
    </aside>
  );
}
