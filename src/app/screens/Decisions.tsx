import { useState } from 'react';
import { DEMO_CLAIM_EVENT } from '../../data/demo';
import { cdtLabel } from '../../engine/cdt';
import { formatDate, toDay, yearOf } from '../../engine/dates';
import { usd } from '../../engine/format';
import { applyClaim } from '../../engine/ledger';
import type { Ctx } from '../App';
import { Explanation, Waterfall } from '../components/Waterfall';
import { download, toIcs } from '../ics';
import { initialState } from '../state';

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function Decisions({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <EnrollmentCard ctx={ctx} />
      <Dashboard ctx={ctx} />
      <Activity ctx={ctx} />
    </>
  );
}

function EnrollmentCard({ ctx }: { ctx: Ctx }) {
  const { card } = ctx.comparison;
  const { profile } = ctx.state;
  const [open, setOpen] = useState<string>();
  const y0 = yearOf(profile.asOf);
  const certain = card.items.filter((i) => i.likelihood >= 1);
  const now = certain.filter((i) => i.fsaYear === y0).map((i) => i.label.replace(/ \(.*?\)/, '').toLowerCase());
  const later = new Map<string, string[]>();
  for (const i of certain.filter((i) => i.fsaYear > y0)) later.set(i.when, [...(later.get(i.when) ?? []), i.label.replace(/ \(.*?\)/, '').toLowerCase()]);
  const lineFor = (id: string) => card.choice.schedule.lines.find((l) => l.id === id);

  const calendar = () =>
    download(
      'ting-dental-plan.ics',
      toIcs([
        ...card.items.map((i) => ({
          date: i.date,
          title: `Dental: ${i.label}${i.prepDated ? ' (preparation appointment)' : ''}`,
          description: `Planned by Ting. ${card.disclaimer}`,
        })),
        { date: `${y0}-11-02`, title: `Open enrollment: choose ${card.choice.plan.name}, elect ${usd(card.fsa.election)} FSA`, description: card.summary },
      ]),
    );

  return (
    <section className="card-decisions" aria-labelledby="card-title">
      <div>
        <h1 id="card-title">Your enrollment decisions</h1>
        <p className="lede">Plan, FSA and dates, worked out from your plan rules, your dentist's treatment plan and what you've used.</p>
      </div>
      <p className="decision-line">
        Choose <strong>{card.choice.plan.name}</strong>
        {card.fsa.election > 0 && (
          <>
            , put <strong>{usd(card.fsa.election)}</strong> in your {card.fsa.year} FSA
          </>
        )}
        {now.length > 0 && <>, do the {listJoin(now)} before Dec 31</>}
        {[...later].map(([when, labels]) => (
          <span key={when}>
            , and book the {listJoin(labels)} for <strong>{when}</strong>
          </span>
        ))}
        . Expected savings: <strong>{usd(Math.round(card.expectedSavings))}</strong>.
      </p>
      <div className="card-items">
        {card.items.map((i) => {
          const l = lineFor(i.id);
          const isOpen = open === i.id;
          return (
            <div className="card-item" key={i.id}>
              <button aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : i.id)}>
                <span>{i.label}</span>
                {i.likelihood < 1 && <span className="small">maybe, {Math.round(i.likelihood * 100)}%</span>}
                <span className="when">
                  {i.when} · {i.fsaYear} FSA · you pay {l ? usd(l.memberOwes) : '—'}
                </span>
              </button>
              {isOpen && l && (
                <div className="detail stack">
                  <p>{reasonFor(ctx, i.id)}</p>
                  <Waterfall line={l} />
                  <Explanation line={l} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="row">
        <button className="btn" onClick={calendar}>
          Add to calendar
        </button>
        <button className="btn" onClick={() => ctx.go('schedule')}>
          Share with my dentist
        </button>
        <button className="btn" onClick={() => ctx.go('compare')}>
          See the plan comparison
        </button>
      </div>
      <p className="disclaimer">
        {card.disclaimer} Compared with keeping {profile.currentPlan.name} and doing everything now ({usd(Math.round(card.baselineTotal))}{' '}
        after tax, with premiums).
        {card.fsa.provisional && ` ${card.fsa.year} FSA limit not yet published by the IRS; using ${usd(card.fsa.limit)}.`}
      </p>
    </section>
  );
}

function reasonFor(ctx: Ctx, id: string): string {
  const { profile } = ctx.state;
  const proc = profile.procedures.find((p) => p.id === id);
  const line = ctx.comparison.card.choice.schedule.lines.find((l) => l.id === id);
  if (!proc || !line) return '';
  const y0 = yearOf(profile.asOf);
  if (proc.locked) return 'Your dentist marked this urgent, so it stays at the earliest date.';
  if ((proc.likelihood ?? 1) < 1) return `Your dentist said this might be needed. Ting counts it at ${Math.round((proc.likelihood ?? 1) * 100)}% when choosing the plan and FSA amount.`;
  if (line.year > y0)
    return `In ${line.year} this falls under a fresh ${usd(ctx.comparison.card.choice.plan.annualMax)} annual max and is paid with pre-tax ${line.year} FSA dollars, before your dentist's deadline.`;
  return `It fits in what's left of this year's max (${usd(line.maxRemainingBefore)} before this visit) and your ${y0} FSA balance pays for it.`;
}

function Gauge({ parts, total }: { parts: { value: number; color: string; label: string }[]; total: number }) {
  return (
    <>
      <div className="gauge-bar" role="img" aria-label={parts.map((p) => `${p.label} ${usd(Math.round(p.value))}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(Math.max(0, p.value) / (total || 1)) * 100}%`, background: p.color }} title={`${p.label}: ${usd(Math.round(p.value))}`} />
        ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} {usd(Math.round(p.value))}
          </span>
        ))}
      </div>
    </>
  );
}

function Dashboard({ ctx }: { ctx: Ctx }) {
  const { profile } = ctx.state;
  const { ledger, currentPlan: plan, money } = profile;
  const thisYear = ctx.schedule.years[0];
  const max = plan.annualMax + ledger.rolloverBalance;
  const scheduled = Math.min(thisYear.planPaid, Math.max(0, max - ledger.maxUsed));
  const remaining = Math.max(0, max - ledger.maxUsed - scheduled);
  const fsaSpend = Math.min(thisYear.owes, money.fsaBalance);
  const forfeit = ctx.comparison.card.fsa.forfeitDate;
  const daysLeft = toDay(forfeit) - toDay(profile.asOf);
  const y0 = yearOf(profile.asOf);
  const cleaningsThisYear =
    ledger.history.filter((h) => h.cdt === 'D1110' && yearOf(h.date) === y0).length +
    ctx.placements.filter((p) => profile.procedures.find((q) => q.id === p.id)?.cdt === 'D1110' && yearOf(p.date) === y0).length;
  const leftovers = [
    money.fsaBalance - fsaSpend > 0 && `${usd(Math.round(money.fsaBalance - fsaSpend))} of FSA money not yet planned (forfeit after ${formatDate(forfeit)}, up to ${money.fsaRule.kind === 'carryover' ? usd(money.fsaRule.max) : '$0'} carries over)`,
    cleaningsThisYear < 2 && `${2 - cleaningsThisYear} covered cleaning${cleaningsThisYear === 1 ? '' : 's'} unused this year`,
    remaining > 0 && `${usd(Math.round(remaining))} of this year's max unused`,
  ].filter((x): x is string => typeof x === 'string');

  return (
    <section className="panel stack" aria-labelledby="dash-title">
      <h2 id="dash-title">{y0} so far</h2>
      <div className="gauges">
        <div>
          <div className="small muted">Annual max</div>
          <div className="big num">{usd(Math.round(remaining))} left</div>
          <Gauge
            total={max}
            parts={[
              { value: ledger.maxUsed, color: 'var(--ink)', label: 'Used' },
              { value: scheduled, color: 'var(--plan)', label: 'Scheduled' },
              { value: remaining, color: 'var(--line)', label: 'Left' },
            ]}
          />
        </div>
        <div>
          <div className="small muted">Deductible</div>
          <div className="big num">
            {usd(ledger.deductibleMet)} of {usd(plan.deductible.amount)}
          </div>
          <p className="small muted">
            {ledger.deductibleMet >= plan.deductible.amount ? 'Met for this year.' : 'Not met yet.'}
            {plan.q4DeductibleCarryover && ' Deductible paid from Oct 1 also counts toward next year.'}
          </p>
        </div>
        <div>
          <div className="small muted">FSA balance</div>
          <div className="big num">{usd(money.fsaBalance)}</div>
          <p className="small muted">
            {usd(Math.round(fsaSpend))} planned for scheduled care. {daysLeft} days until {formatDate(forfeit)}.
          </p>
        </div>
      </div>
      {leftovers.length > 0 && (
        <div className="banner">
          <strong>Left on the table: </strong>
          {listJoin(leftovers)}.
        </div>
      )}
    </section>
  );
}

function Activity({ ctx }: { ctx: Ctx }) {
  const { state, update } = ctx;
  const claimed = state.profile.ledger.history.some((h) => h.claimId === DEMO_CLAIM_EVENT.claimId);
  const simulate = () =>
    update((s) => {
      const r = applyClaim(s.profile, DEMO_CLAIM_EVENT);
      if (r.duplicate) return s;
      const checks = r.checks.map((c) => {
        const proc = s.profile.procedures.find((p) => p.id === c.id);
        const name = proc ? cdtLabel(proc.cdt, proc.tooth) : c.id;
        return c.mismatch
          ? `Lincoln's EOB for the ${name.toLowerCase()} says you owe ${usd(c.actual)}; Ting estimated ${usd(c.estimated)}. Worth a check.`
          : `Lincoln processed the ${name.toLowerCase()}: you owe ${usd(c.actual)}, matching Ting's estimate.`;
      });
      return {
        ...s,
        profile: r.profile,
        manual: {},
        activity: [
          ...checks.map((text) => ({ date: DEMO_CLAIM_EVENT.serviceDate, text, kind: 'claim' as const })),
          ...s.activity,
        ],
      };
    });

  const history = [...state.profile.ledger.history].reverse();
  return (
    <section className="panel stack" aria-labelledby="activity-title">
      <div className="row">
        <h2 id="activity-title">Activity</h2>
        <button className="btn" onClick={simulate} disabled={claimed} style={{ marginLeft: 'auto' }}>
          {claimed ? 'Lincoln claim received' : 'Simulate a Lincoln claim (demo)'}
        </button>
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {state.activity.map((a, i) => (
          <li key={`a${i}`} className={a.kind === 'claim' ? 'banner good' : 'banner'}>
            <span className="small muted">{formatDate(a.date)}</span> {a.text}
          </li>
        ))}
        {history.map((h, i) => (
          <li key={`h${i}`} className="row small">
            <span className="muted num" style={{ minWidth: 100 }}>
              {formatDate(h.date)}
            </span>
            <span>{cdtLabel(h.cdt, h.tooth)}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              plan paid {usd(h.planPaid)} · {h.source === 'claim' ? 'Lincoln claim' : h.source === 'invoice' ? 'invoice' : 'you added'}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <button className="link small" onClick={() => update(() => ({ ...initialState(), onboarded: true }))}>
          Reset demo data
        </button>
      </div>
    </section>
  );
}
