import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, type IntakeQuestion } from '../api';
import type { ProcedureItem } from '../contracts';
import { isSpeechSupported, listen } from '../lib/speech';
import { useAppStore } from '../store';
import { CameraIcon, MicIcon } from './Icons';

const EXAMPLES = ['Root canal and a crown on #19', 'Two wisdom teeth out', 'Might need braces for my son', 'Cleaning and X-rays'];

export function IntakeBox() {
  const addProcedures = useAppStore((s) => s.addProcedures);
  const updateProcedure = useAppStore((s) => s.updateProcedure);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [viaVoice, setViaVoice] = useState(false);
  const [note, setNote] = useState('');
  const [questions, setQuestions] = useState<{ q: IntakeQuestion; itemIds: string[] }[]>([]);
  const stopRef = useRef<() => void>(() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = isSpeechSupported();

  const parse = useMutation({
    mutationFn: (t: string) => api.parseDescription(t),
    onSuccess: ({ items, questions: qs }) => {
      const tagged: ProcedureItem[] = items.map((i) => ({ ...i, source: viaVoice ? 'voice' : 'typed' }));
      addProcedures(tagged);
      setQuestions(qs.map((q) => ({ q, itemIds: tagged.map((i) => i.id) })));
      setNote(items.length ? `Added ${items.length} item${items.length > 1 ? 's' : ''}.` : "We couldn't spot a procedure. Try words like crown, filling or cleaning.");
      setText('');
      setViaVoice(false);
    },
    onError: (e) => setNote(`Couldn't read that: ${e instanceof Error ? e.message : 'unknown error'}`),
  });

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadDocument(f),
    onSuccess: (r) => {
      if (r.items?.length) addProcedures(r.items);
      setNote(
        r.items?.length
          ? `Read your ${r.kind.replace('_', ' ')}: found ${r.items.length} items. Please confirm them below.`
          : `Saved as ${r.kind.replace('_', ' ')}.`,
      );
    },
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

  const answer = (entry: { q: IntakeQuestion; itemIds: string[] }, option: string) => {
    if (entry.q.id === 'likelihood') {
      const pct = Number(option.match(/(\d+)%/)?.[1] ?? 50);
      for (const id of entry.itemIds) {
        const p = useAppStore.getState().procedures.find((x) => x.id === id);
        if (p && p.likelihood !== undefined) updateProcedure(id, { likelihood: pct / 100 });
      }
    }
    setQuestions((qs) => qs.filter((x) => x !== entry));
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
        <label htmlFor="intake" className="text-sm font-medium">
          Describe the dental work you've been told you need
        </label>
        <div className="mt-1.5 rounded-xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            id="intake"
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
              className={`btn-secondary px-2.5 py-1.5 ${listening ? 'border-cost text-cost' : ''}`}
              onClick={toggleMic}
              disabled={!speech}
              aria-pressed={listening}
              title={speech ? 'Speak instead of typing' : "Voice input isn't supported in this browser"}
            >
              <MicIcon /> {listening ? 'Listening… tap to stop' : 'Speak'}
            </button>
            <button type="button" className="btn-secondary px-2.5 py-1.5" onClick={() => fileRef.current?.click()} disabled={busy}>
              <CameraIcon /> Photo of treatment plan
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="sr-only"
              aria-label="Upload a photo of your treatment plan"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
            <button type="submit" className="btn-primary ml-auto px-3 py-1.5" disabled={busy || !text.trim()}>
              {parse.isPending ? 'Reading…' : 'Add to plan'}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-brand-500 hover:text-ink" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>

      <p className="mt-2 min-h-5 text-sm text-muted" aria-live="polite">
        {upload.isPending ? 'Reading your document…' : note}
      </p>

      {questions.length > 0 && (
        <ul className="mt-2 space-y-2">
          {questions.map((entry) => (
            <li key={entry.q.id} className="rounded-xl border border-line bg-brand-50/60 p-3">
              <p className="text-sm font-medium">{entry.q.text}</p>
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-semibold">Why we're asking:</span> {entry.q.why}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.q.options.map((o) => (
                  <button key={o} type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => answer(entry, o)}>
                    {o}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
