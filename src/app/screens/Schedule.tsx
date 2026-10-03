import { useState } from 'react';
import { CDT, cdtLabel } from '../../engine/cdt';
import { formatDate, fromDay, toDay, yearOf } from '../../engine/dates';
import { usd } from '../../engine/format';
import { dentistQuestions, validatePlacements } from '../../engine/schedule';
import type { Ctx } from '../App';
import { Explanation, Waterfall } from '../components/Waterfall';
import type { ScheduleKind } from '../state';

const KINDS: [ScheduleKind, string, string][] = [
  ['cheapest', 'Cheapest', 'Lowest cost within every deadline'],
  ['balanced', 'Balanced', 'Most of the savings, less waiting'],
  ['fastest', 'Fastest', 'Everything as soon as possible'],
];

export function Schedule({ ctx }: { ctx: Ctx }) {
  const { state, update, optimized, schedule, placements, nextPlan } = ctx;
  const { profile } = state;
  const [selected, setSelected] = useState<string | undefined>(placements[0]?.id);
  const y0 = yearOf(profile.asOf);
  const start = toDay(profile.asOf);
  const lastDeadline = profile.procedures.reduce((m, p) => (p.deadline && p.deadline > m ? p.deadline : m), `${y0 + 1}-06-30`);
  const end = toDay(lastDeadline > `${y0 + 1}-12-31` ? `${y0 + 2}-12-31` : lastDeadline > `${y0 + 1}-06-30` ? `${y0 + 1}-12-31` : `${y0 + 1}-06-30`);
  const pos = (day: number) => ((day - start) / (end - start)) * 100;
  const yearLine = pos(toDay(`${y0 + 1}-01-01`));
  const ticks: { day: number; label: string }[] = [];
  for (let m = 1; m < 30; m += 2) {
    const d = new Date(Date.UTC(y0, Number(profile.asOf.slice(5, 7)) - 1 + m, 1));
    const day = Math.round(d.getTime() / 86_400_000);
    if (day >= end) break;
    if (Math.abs(pos(day) - yearLine) > 5) ticks.push({ day, label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) });
  }

  const violations = validatePlacements(profile, placements);
  const fastest = optimized.fastest;
  const line = schedule.lines.find((l) => l.id === selected);
  const dragged = Object.keys(state.manual).length > 0;
  const setDate = (id: string, day: number) => update((s) => ({ ...s, manual: { ...s.manual, [id]: fromDay(day) } }));

  return (
    <>
      <section className="panel stack">
        <div>
          <h1>When to do each procedure</h1>
          <p className="muted">
            Drag a procedure across Dec 31 to see what it does to your bill. Nothing moves past your dentist's deadline, and urgent work
            stays put.
          </p>
        </div>
        <div className="plan-picker" role="group" aria-label="Schedule options">
          {KINDS.map(([kind, label, hint]) => {
            const plan = optimized[kind];
            return (
              <button
                key={kind}
                className="plan-choice"
                aria-pressed={state.scheduleKind === kind && !dragged}
                onClick={() => update((s) => ({ ...s, scheduleKind: kind, manual: {} }))}
              >
                <strong>{label}</strong>
                <div className="big num">{usd(Math.round(plan.expectedCost))}</div>
                <div className="small muted">
                  {hint}. Done by {formatDate(plan.finish)}.
                </div>
              </button>
            );
          })}
        </div>
        <div className="row small">
          <label>
            Next year's plan{' '}
            <select
              value={nextPlan.id}
              onChange={(e) => update((s) => ({ ...s, nextPlanId: e.target.value, manual: {} }))}
            >
              {state.planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === ctx.comparison.best.plan.id ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          </label>
          {dragged && (
            <button className="link" onClick={() => update((s) => ({ ...s, manual: {} }))}>
              Reset to Ting's schedule
            </button>
          )}
        </div>
      </section>

      <section className="panel stack" aria-label="Timeline">
        <div className="timeline">
          <div className="tl-axis" aria-hidden>
            <span />
            <div className="tl-track">
              {ticks.map((t) => (
                <span key={t.day} className="tl-tick" style={{ left: `${pos(t.day)}%` }}>
                  {t.label}
                </span>
              ))}
              <span className="tl-yearlabel" style={{ left: `${yearLine}%` }}>
                Jan 1, {y0 + 1}
              </span>
            </div>
            <span />
          </div>
          {placements.map((pl) => {
            const proc = profile.procedures.find((p) => p.id === pl.id);
            if (!proc) return null;
            const l = schedule.lines.find((x) => x.id === pl.id);
            const deadlineDay = proc.deadline ? Math.min(end, toDay(proc.deadline)) : end;
            const name = cdtLabel(proc.cdt, proc.tooth);
            const cls = ['tl-row', yearOf(pl.date) > y0 ? 'next-year' : '', proc.locked ? 'locked' : '', (proc.likelihood ?? 1) < 1 ? 'maybe' : '']
              .filter(Boolean)
              .join(' ');
            return (
              <div key={pl.id} className={cls}>
                <div className="tl-name">
                  <button className="link" onClick={() => setSelected(pl.id)} aria-pressed={selected === pl.id}>
                    {name}
                  </button>
                  {proc.locked && <span className="small muted"> · urgent, locked</span>}
                </div>
                <div className="tl-track">
                  <span className="tl-yearline" style={{ left: `${yearLine}%` }} />
                  {deadlineDay < end && <span className="tl-deadline" style={{ left: `${pos(deadlineDay)}%` }} title={`Dentist's deadline ${formatDate(proc.deadline ?? '')}`} />}
                  <input
                    type="range"
                    style={{ width: `${pos(deadlineDay)}%` }}
                    min={start}
                    max={deadlineDay}
                    value={toDay(pl.date)}
                    disabled={proc.locked}
                    aria-label={`${name} date`}
                    aria-valuetext={formatDate(pl.date)}
                    onChange={(e) => setDate(pl.id, Number(e.target.value))}
                    onFocus={() => setSelected(pl.id)}
                  />
                </div>
                <div className="tl-date num">
                  <div>{formatDate(pl.date).replace(/, \d{4}$/, '')}</div>
                  <div className={l && l.memberOwes > 0 ? 'you-pay' : 'muted'}>{l ? usd(l.memberOwes) : ''}</div>
                </div>
              </div>
            );
          })}
        </div>

        {violations.length > 0 && (
          <div className="banner bad" role="alert">
            {violations.map((v) => (
              <p key={v.id + v.message}>{v.message}</p>
            ))}
          </div>
        )}

        <div className="total-strip" aria-live="polite">
          <div>
            <div className="small muted">You pay dentists</div>
            <div className="big num">{usd(Math.round(schedule.expectedOwes))}</div>
          </div>
          <div>
            <div className="small muted">After FSA tax savings</div>
            <div className="big num">{usd(Math.round(schedule.expectedCost))}</div>
          </div>
          <div>
            <div className="small muted">Saved vs doing it all now</div>
            <div className="big num plan-pays">{usd(Math.max(0, Math.round(fastest.expectedCost - schedule.expectedCost)))}</div>
          </div>
          {schedule.years.slice(0, 2).map((y) => (
            <div key={y.year} className="small">
              <strong>{y.year}</strong>: you pay {usd(Math.round(y.owes))}, {usd(Math.round(y.maxRemaining))} of max left
            </div>
          ))}
        </div>
        {profile.procedures.some((p) => (p.likelihood ?? 1) < 1) && (
          <p className="small muted">"Maybe" work counts at its likelihood. If all of it happens: {usd(Math.round(schedule.badYearCost))} after tax.</p>
        )}
      </section>

      {line && (
        <section className="panel stack">
          <h2>{cdtLabel(line.cdt, line.tooth)} on {formatDate(line.date)}</h2>
          {CDT[line.cdt]?.prepDated && (
            <p className="banner">
              For crowns and bridges the plan year is set by the preparation appointment, not the day it's seated. Book the
              preparation on {formatDate(line.date)}{line.year > y0 ? ' (on or after Jan 1)' : ''}.
            </p>
          )}
          <Waterfall line={line} />
          <Explanation line={line} />
        </section>
      )}

      <DentistQuestions ctx={ctx} />
    </>
  );
}

export function DentistQuestions({ ctx }: { ctx: Ctx }) {
  const questions = [
    ...dentistQuestions(ctx.state.profile, ctx.placements, ctx.optimized.fastest.placements),
    'Please submit a pre-treatment estimate to Lincoln for the major work.',
    'Are you in network with Lincoln DentalConnect?',
  ];
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel stack">
      <h2>Questions for your dentist</h2>
      <p className="muted">Your dentist sets the deadlines. Every delay Ting suggests comes with a question for them.</p>
      <ol>
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ol>
      <div>
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard?.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy questions'}
        </button>
      </div>
    </section>
  );
}
