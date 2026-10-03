import { cdtLabel } from '../../engine/cdt';
import { DISCLAIMER } from '../../engine/compare';
import { formatDate } from '../../engine/dates';
import { usd } from '../../engine/format';
import type { Ctx } from '../App';

export function ComparePlans({ ctx }: { ctx: Ctx }) {
  const { comparison, state, update } = ctx;
  const { options, best, insights, tipping, card } = comparison;
  const { profile } = state;
  const maybes = profile.procedures.filter((p) => (p.likelihood ?? 1) < 1);
  const y1 = card.fsa.year;

  return (
    <>
      <section className="panel stack">
        <div>
          <h1>Which option for {y1}?</h1>
          <p className="muted">
            Premiums plus what you'd pay for care, after tax, with your treatment plan scheduled the cheapest way under each option. Ting
            compares Acme's Lincoln plans with paying yourself and your dentist's membership plan; it never recommends another insurer.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col">Premiums / year</th>
                <th scope="col">Care, after tax</th>
                <th scope="col">Expected total</th>
                <th scope="col">If every "maybe" happens</th>
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.plan.id} className={o === best ? 'best' : undefined}>
                  <td>
                    <strong>{o.plan.name}</strong>
                    {o === best && <span className="badge ok" style={{ marginLeft: 8 }}>Recommended</span>}
                    {!o.switching && <div className="small muted">Your current plan</div>}
                    {o.waiting.length > 0 && <div className="small you-pay">Waiting period applies to {o.waiting.length} procedure(s)</div>}
                  </td>
                  <td className="num">{usd(o.premiumsAnnual)}</td>
                  <td className="num">{usd(Math.round(o.careCost))}</td>
                  <td className="num">
                    <strong>{usd(Math.round(o.total))}</strong>
                  </td>
                  <td className="num">{usd(Math.round(o.badYearTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="disclaimer">{DISCLAIMER} Pre-tax premiums are shown before the tax saving; totals include it.</p>
      </section>

      {maybes.length > 0 && (
        <section className="panel stack">
          <h2>Work your dentist said might be needed</h2>
          <p className="muted">Set how likely each one is. The recommendation updates, and the marker shows where it flips.</p>
          {maybes.map((p) => {
            const t = tipping.find((x) => x.procedureId === p.id);
            const pct = Math.round((p.likelihood ?? 1) * 100);
            return (
              <div className="maybe-slider" key={p.id}>
                <label htmlFor={`maybe-${p.id}`}>
                  <strong>{cdtLabel(p.cdt, p.tooth)}</strong>: {pct}% likely
                </label>
                <div className="maybe-track">
                  <input
                    id={`maybe-${p.id}`}
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) => {
                      const likelihood = Math.min(0.99, Number(e.target.value) / 100);
                      update((s) => ({
                        ...s,
                        manual: {},
                        profile: { ...s.profile, procedures: s.profile.procedures.map((q) => (q.id === p.id ? { ...q, likelihood } : q)) },
                      }));
                    }}
                  />
                  {t && <span className="tip-mark" style={{ left: `calc(${t.likelihood * 100}% - 1px)` }} title={t.text} />}
                </div>
                <p className="small">{t ? t.text : 'At any likelihood the recommendation stays the same.'}</p>
              </div>
            );
          })}
        </section>
      )}

      <section className="panel stack">
        <h2>{y1} FSA</h2>
        <p>
          Elect <strong className="num">{usd(card.fsa.election)}</strong>. That covers {usd(Math.round(card.fsa.expectedCare))} of expected
          care in {y1} (certain work plus each "maybe" times its likelihood)
          {card.fsa.carryoverIn > 0 && <>, minus {usd(Math.round(card.fsa.carryoverIn))} carried over from this year</>}.
        </p>
        <p className="small muted">
          A health FSA's full election is available on the first day of the plan year, so a January crown can be paid entirely pre-tax.
          The IRS limit is {usd(card.fsa.limit)}
          {card.fsa.provisional ? ` (the ${y1} figure isn't published yet; this is the latest known limit)` : ''}. Money left after{' '}
          {formatDate(card.fsa.forfeitDate)} beyond the carryover is lost.
        </p>
      </section>

      {insights.length > 0 && (
        <section className="panel stack">
          <h2>What Ting noticed</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {insights.map((i) => (
              <li key={i.id + i.text}>{i.text}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
