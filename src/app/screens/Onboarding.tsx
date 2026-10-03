import { useState } from 'react';
import { cdtLabel } from '../../engine/cdt';
import type { Ctx } from '../App';
import type { AppState } from '../state';

/** First run: the plan is already loaded from sign-in, so three questions. */
export function Onboarding({ ctx }: { ctx: Ctx }) {
  const { profile } = ctx.state;
  const lastCleaning = [...profile.ledger.history].reverse().find((h) => h.cdt === 'D1110')?.date ?? '';
  const [work, setWork] = useState<'plan' | 'add' | 'none'>('plan');
  const [cleaning, setCleaning] = useState(lastCleaning);
  const [household, setHousehold] = useState<AppState['household']>('me');

  const finish = () => {
    ctx.update((s) => {
      const history = s.profile.ledger.history.filter((h) => !(h.cdt === 'D1110' && h.source === 'user'));
      if (cleaning && cleaning !== lastCleaning) history.push({ date: cleaning, cdt: 'D1110', planPaid: 0, source: 'user' });
      return {
        ...s,
        onboarded: true,
        household,
        profile: { ...s.profile, procedures: work === 'plan' ? s.profile.procedures : [], ledger: { ...s.profile.ledger, history } },
      };
    });
    ctx.go(work === 'add' ? 'add' : 'decisions');
  };

  return (
    <section className="panel stack onboard">
      <div className="stack">
        <h1>Welcome, Jordan</h1>
        <p>
          Acme signed you in, and Lincoln loaded your plan: <strong>{profile.currentPlan.name}</strong>. Your dental information stays with
          Lincoln. Acme never sees your procedures, claims or answers, only anonymous totals for groups of 20 or more. You can delete
          everything at any time.
        </p>
      </div>
      <ol>
        <li className="stack">
          <strong>Has your dentist recommended or mentioned any work?</strong>
          <label>
            <input type="radio" name="work" checked={work === 'plan'} onChange={() => setWork('plan')} /> Yes, from my treatment plan:{' '}
            {profile.procedures.map((p) => cdtLabel(p.cdt, p.tooth)).join(', ')}
          </label>
          <label>
            <input type="radio" name="work" checked={work === 'add'} onChange={() => setWork('add')} /> Yes, I'll type, say or photograph it
          </label>
          <label>
            <input type="radio" name="work" checked={work === 'none'} onChange={() => setWork('none')} /> No
          </label>
        </li>
        <li className="stack">
          <label htmlFor="last-cleaning">
            <strong>When was your last cleaning?</strong>
          </label>
          <span className="small muted">Your plan covers two a year; this sets your next reminder.</span>
          <input id="last-cleaning" type="date" value={cleaning} max={profile.asOf} onChange={(e) => setCleaning(e.target.value)} />
        </li>
        <li className="stack">
          <strong>Who's on your dental plan?</strong>
          {(
            [
              ['me', 'Just me'],
              ['spouse', 'Me and my spouse'],
              ['family', 'Me and my family'],
            ] as const
          ).map(([v, label]) => (
            <label key={v}>
              <input type="radio" name="household" checked={household === v} onChange={() => setHousehold(v)} /> {label}
            </label>
          ))}
          {household !== 'me' && <span className="small muted">Ting plans for you first; per-person planning for family members is coming.</span>}
        </li>
      </ol>
      <p className="small muted">Ting asks more only when an answer could change a recommendation, and always says why.</p>
      <div>
        <button className="btn primary" onClick={finish}>
          Show my decisions
        </button>
      </div>
    </section>
  );
}
