import { useMemo, useRef, useState } from 'react';
import { cdtLabel } from '../../engine/cdt';
import { addMonths } from '../../engine/dates';
import { usd } from '../../engine/format';
import type { ServiceRecord } from '../../engine/types';
import { parseDescription } from '../../intake/describe';
import { intakeQuestions, toProcedures } from '../../intake/questions';
import { parseTreatmentPlanText } from '../../intake/treatmentPlan';
import type { IntakeItem, IntakeSource } from '../../intake/types';
import { localOcr } from '../../services/ocr';
import { pdfText } from '../../services/pdf';
import type { Ctx } from '../App';

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;
declare global {
  interface Window {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  }
}
const speechApi = (): SpeechCtor | undefined => window.SpeechRecognition ?? window.webkitSpeechRecognition;

interface Extra {
  deadline: string;
  maybe: boolean;
  likelihood: number;
}

/** Text, voice and photo intake all end up as the same items; only questions that change the bill get asked. */
export function AddWork({ ctx }: { ctx: Ctx }) {
  const { profile } = ctx.state;
  const [text, setText] = useState('');
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [status, setStatus] = useState('');
  const [listening, setListening] = useState(false);
  const [rawText, setRawText] = useState('');
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const questions = useMemo(() => intakeQuestions(items, profile), [items, profile]);
  const priced = useMemo(() => toProcedures(items, profile), [items, profile]);

  const load = (next: IntakeItem[], note: string) => {
    setItems(next);
    const deadline = addMonths(profile.asOf, 3);
    setExtra(Object.fromEntries(next.map((i) => [i.id, { deadline, maybe: false, likelihood: 0.5 }])));
    setStatus(next.length ? note : 'No dental procedures found. Try naming the work, like "crown on tooth 19".');
  };

  const fromText = (source: IntakeSource) => load(parseDescription(text, source), '');

  const speak = () => {
    const Api = speechApi();
    if (!Api) {
      setStatus("This browser doesn't support speech input. Type the description instead, or use Chrome or Edge.");
      return;
    }
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const r = new Api();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results, (res) => res[0]?.transcript ?? '').join(' ');
      setText(said);
      load(parseDescription(said, 'voice'), `Heard: "${said}"`);
    };
    r.onerror = (e) => setStatus(`Speech input stopped: ${e.error}.`);
    r.onend = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  };

  const fromFile = async (file: File) => {
    try {
      setStatus(`Reading ${file.name}…`);
      let extracted: string;
      if (file.type === 'application/pdf') extracted = (await pdfText(file)).pages.join('\n');
      else if (file.type.startsWith('image/')) {
        const ocr = await localOcr.recognize(file);
        extracted = ocr.text;
      } else extracted = await file.text();
      setRawText(extracted);
      const parsed = parseTreatmentPlanText(extracted, file.type.startsWith('image/') ? 'photo' : 'upload');
      setUnrecognized(parsed.unrecognized);
      load(parsed.items, `Found ${parsed.items.length} procedure${parsed.items.length === 1 ? '' : 's'} in ${file.name}.`);
    } catch (err) {
      setStatus(`Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}. Try a clearer photo or type the work instead.`);
    }
  };

  const answer = (itemId: string, field: 'cdt' | 'tooth' | 'replacement', value: string) =>
    setItems((xs) =>
      xs.map((i) =>
        i.id !== itemId
          ? i
          : field === 'cdt'
            ? { ...i, candidates: [{ cdt: value, p: 1 }] }
            : field === 'tooth'
              ? { ...i, teeth: [{ tooth: Number(value), p: 1 }] }
              : { ...i, replacement: value === 'yes' ? 1 : 0 },
      ),
    );

  const add = () => {
    const existing = new Set(profile.procedures.map((p) => p.id));
    const procs = priced.map((p) => {
      const e = extra[p.id];
      let id = p.id;
      for (let n = 2; existing.has(id); n++) id = `${p.id}-${n}`;
      existing.add(id);
      return { ...p, id, deadline: e?.deadline || undefined, likelihood: e?.maybe ? e.likelihood : undefined };
    });
    const replaced: ServiceRecord[] = items
      .filter((i) => (i.replacement ?? 0) >= 0.5)
      .flatMap((i) => {
        const p = priced.find((x) => x.id === i.id);
        return p ? [{ date: addMonths(profile.asOf, -36), cdt: p.cdt, tooth: p.tooth, planPaid: 0, source: 'user' as const }] : [];
      });
    ctx.update((s) => ({
      ...s,
      manual: {},
      profile: {
        ...s.profile,
        procedures: [...s.profile.procedures, ...procs],
        ledger: { ...s.profile.ledger, history: [...s.profile.ledger.history, ...replaced] },
      },
      activity: [{ date: s.profile.asOf, kind: 'intake', text: `Added ${procs.map((p) => cdtLabel(p.cdt, p.tooth).toLowerCase()).join(', ')}.` }, ...s.activity],
    }));
    setItems([]);
    setText('');
    setStatus(`Added ${procs.length} procedure${procs.length === 1 ? '' : 's'} to your schedule.`);
  };

  return (
    <>
      <section className="panel stack">
        <div>
          <h1>Add dental work</h1>
          <p className="muted">Describe what your dentist recommended, say it out loud, or upload the treatment plan they gave you.</p>
        </div>
        <label htmlFor="describe" className="small">
          What did your dentist recommend?
        </label>
        <textarea
          id="describe"
          value={text}
          placeholder="Crown on a lower back molar and a deep cleaning"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          <button className="btn primary" onClick={() => fromText('text')} disabled={!text.trim()}>
            Find procedures
          </button>
          <button className="btn" onClick={speak} aria-pressed={listening}>
            {listening ? 'Stop listening' : 'Speak instead'}
          </button>
        </div>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void fromFile(f);
          }}
        >
          <p>Drop a treatment plan here (photo, PDF or text), or</p>
          <label className="btn" style={{ display: 'inline-block', marginTop: 8 }}>
            Choose a file or take a photo
            <input
              type="file"
              accept="image/*,application/pdf,.txt"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void fromFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <p className="small muted" style={{ marginTop: 8 }}>
            <a href="/samples/treatment-plan.png" download>
              Sample treatment plan photo
            </a>{' '}
            ·{' '}
            <a href="/samples/treatment-plan.txt" download>
              as text
            </a>
          </p>
        </div>
        {status && (
          <p className="small" role="status">
            {status}
          </p>
        )}
        {rawText && (
          <details className="small">
            <summary>Text Ting read from the file</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{rawText}</pre>
            {unrecognized.length > 0 && <p className="you-pay">Codes Ting doesn't know yet: {unrecognized.join(', ')}</p>}
          </details>
        )}
      </section>

      {items.length > 0 && (
        <section className="panel stack">
          <h2>Check what Ting found</h2>
          {questions.map((q) => (
            <fieldset className="confirm-card" key={q.itemId + q.field}>
              <legend>
                <strong>{q.prompt}</strong>
              </legend>
              <p className="small">
                {q.why} Ting is {Math.round((q.options.find((o) => o.value === q.preselected)?.p ?? 0) * 100)}% sure, so it's worth one tap.
              </p>
              <div className="choice-row">
                {q.options.map((o) => (
                  <label key={o.value}>
                    <input type="radio" name={q.itemId + q.field} defaultChecked={o.value === q.preselected} onChange={() => answer(q.itemId, q.field, o.value)} />
                    {o.label} <span className="muted small">({Math.round(o.p * 100)}%, you'd pay {usd(o.owes)})</span>
                  </label>
                ))}
              </div>
              <div>
                <button className="btn" onClick={() => answer(q.itemId, q.field, q.preselected)}>
                  Confirm
                </button>
              </div>
            </fieldset>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Procedure</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Dentist's deadline</th>
                  <th scope="col">Only maybe?</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const p = priced.find((x) => x.id === i.id);
                  const e = extra[i.id];
                  const inferred = (i.candidates.length > 1 || i.teeth.length > 1) && !questions.some((q) => q.itemId === i.id);
                  return (
                    <tr key={i.id}>
                      <td>
                        {p ? cdtLabel(p.cdt, p.tooth) : i.phrase}{' '}
                        {inferred && (
                          <span className="inferred" title={`Guessing wrong would cost little, so Ting didn't ask. Top guess ${Math.round(i.confidence * 100)}%.`}>
                            inferred
                          </span>
                        )}
                        <div className="small muted">from "{i.phrase}"</div>
                      </td>
                      <td className="num">{p ? usd(p.fee) : 'unknown fee'}</td>
                      <td>
                        <input
                          type="date"
                          value={e?.deadline ?? ''}
                          min={profile.asOf}
                          aria-label="Dentist's deadline"
                          onChange={(ev) => setExtra((x) => ({ ...x, [i.id]: { ...x[i.id], deadline: ev.target.value } }))}
                        />
                      </td>
                      <td>
                        <label className="small">
                          <input
                            type="checkbox"
                            checked={e?.maybe ?? false}
                            onChange={(ev) => setExtra((x) => ({ ...x, [i.id]: { ...x[i.id], maybe: ev.target.checked } }))}
                          />{' '}
                          maybe
                        </label>
                        {e?.maybe && (
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={Math.round(e.likelihood * 100)}
                            aria-label="Likelihood percent"
                            style={{ width: 64, marginLeft: 6 }}
                            onChange={(ev) => setExtra((x) => ({ ...x, [i.id]: { ...x[i.id], likelihood: Number(ev.target.value) / 100 } }))}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Only your dentist sets deadlines. Ting never schedules anything after one.</p>
          <div className="row">
            <button className="btn primary" onClick={add} disabled={!priced.length}>
              Add to my schedule
            </button>
            <button className="btn" onClick={() => setItems([])}>
              Discard
            </button>
          </div>
        </section>
      )}
    </>
  );
}
