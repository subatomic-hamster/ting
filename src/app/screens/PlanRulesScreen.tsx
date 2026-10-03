import { useState } from 'react';
import { approveRules, compilePlanText, finalizeRules, applyAnswers, type Answer, type AnswerPath, type CompileResult } from '../../compiler/compile';
import { pct, usd } from '../../engine/format';
import type { PlanRules, ServiceClass } from '../../engine/types';
import { parseInsuranceCard, plansForGroup } from '../../intake/insuranceCard';
import { localOcr } from '../../services/ocr';
import { pdfText } from '../../services/pdf';
import type { Ctx } from '../App';

const CLASSES: ServiceClass[] = ['preventive', 'basic', 'major', 'ortho'];

async function readFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') return (await pdfText(file)).pages.join('\n');
  if (file.type.startsWith('image/')) return (await localOcr.recognize(file)).text;
  return file.text();
}

export function PlanRulesScreen({ ctx }: { ctx: Ctx }) {
  const { state, update } = ctx;
  const [result, setResult] = useState<CompileResult>();
  const [answers, setAnswers] = useState<Partial<Record<AnswerPath, Answer>>>({});
  const [status, setStatus] = useState('');
  const [approved, setApproved] = useState<{ rules: PlanRules; hash: string }>();

  const compileFile = async (file: File) => {
    try {
      setStatus(`Reading ${file.name}…`);
      const text = await readFile(file);
      const r = compilePlanText(text);
      setResult(r);
      setAnswers({});
      setApproved(undefined);
      setStatus(
        r.questions.length
          ? `Read ${file.name}. The document doesn't say ${r.questions.length === 1 ? 'one thing' : `${r.questions.length} things`}, and Ting won't guess.`
          : `Read ${file.name}. Every rule was found in the document.`,
      );
    } catch (err) {
      setStatus(`Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}.`);
    }
  };

  const draft = result ? applyAnswers(result.draft, answers) : undefined;
  const final = draft ? finalizeRules(draft) : undefined;

  const approve = async () => {
    if (!final?.ok) return;
    const a = await approveRules(final.rules);
    setApproved(a);
  };

  const use = (mode: 'current' | 'option') => {
    if (!approved) return;
    const rules = approved.rules;
    update((s) => ({
      ...s,
      manual: {},
      profile: mode === 'current' ? { ...s.profile, currentPlan: rules } : s.profile,
      planOptions: [...s.planOptions.filter((p) => p.id !== rules.id), rules],
      activity: [{ date: s.profile.asOf, kind: 'plan', text: `Plan rules ${rules.version} approved${mode === 'current' ? ' as your current plan' : ' as an option'}.` }, ...s.activity],
    }));
    setStatus(`Using ${rules.name} (${rules.version}).`);
  };

  const card = async (file: File) => {
    try {
      setStatus(`Reading ${file.name}…`);
      const info = parseInsuranceCard(await readFile(file));
      const plans = info.groupNumber ? plansForGroup(info.groupNumber) : [];
      setStatus(
        info.groupNumber
          ? `Group ${info.groupNumber}${info.memberId ? `, member ${info.memberId}` : ''}: ${plans.length ? `loaded ${plans.length} plan option(s) for your employer.` : 'no plans on file for that group yet.'}`
          : 'No group number found on the card. Try a sharper photo of the front.',
      );
    } catch (err) {
      setStatus(`Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}.`);
    }
  };

  return (
    <>
      <RulesView rules={state.profile.currentPlan} title="Your plan's rules" />

      <section className="panel stack">
        <div>
          <h2>Load a plan document</h2>
          <p className="muted">
            Upload a benefits summary. Ting turns it into rules, asks about anything the document doesn't say, and stamps the approved
            version so every estimate names the rules it used.
          </p>
        </div>
        <div className="row">
          <label className="btn primary">
            Upload benefits summary
            <input type="file" accept="application/pdf,.txt,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void compileFile(f); e.target.value = ''; }} />
          </label>
          <label className="btn">
            Scan insurance card
            <input type="file" accept="image/*,.txt" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void card(f); e.target.value = ''; }} />
          </label>
          <a className="small" href="/samples/acme-benefits-summary.pdf" download>
            Sample benefits summary (PDF)
          </a>
        </div>
        {status && <p role="status" className="small">{status}</p>}

        {result && (
          <div className="stack">
            {result.questions.map((q) => (
              <div className="confirm-card" key={q.field}>
                <label htmlFor={`q-${q.field}`}>
                  <strong>{q.prompt}</strong>
                </label>
                {q.kind === 'choice' && q.options ? (
                  <select id={`q-${q.field}`} value={String(answers[q.field] ?? '')} onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {q.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : q.kind === 'boolean' ? (
                  <select id={`q-${q.field}`} value={answers[q.field] === undefined ? '' : String(answers[q.field])} onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value === 'true' }))}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    id={`q-${q.field}`}
                    type={q.kind === 'text' ? 'text' : 'number'}
                    value={String(answers[q.field] ?? '')}
                    placeholder={q.kind === 'percent' ? 'e.g. 80' : undefined}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {final && !final.ok && final.errors.length > 0 && (
              <div className="banner bad">
                {final.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            <details className="small">
              <summary>Where each rule came from</summary>
              <ul>
                {Object.entries(result.evidence).map(([field, ev]) => (
                  <li key={field}>
                    <strong>{field}</strong>: "{ev?.snippet}" {ev?.section && <span className="muted">({ev.section})</span>}
                  </li>
                ))}
              </ul>
            </details>
            <div className="row">
              <button className="btn primary" disabled={!final?.ok} onClick={() => void approve()}>
                Approve these rules
              </button>
              {final && !final.ok && <span className="small muted">{final.missing.length} answer(s) still needed.</span>}
            </div>
            {approved && (
              <div className="banner good stack">
                <p>
                  Approved as <strong>{approved.rules.version}</strong>. Fingerprint <code>{approved.hash.slice(0, 16)}…</code>
                </p>
                <div className="row">
                  <button className="btn primary" onClick={() => use('current')}>
                    Use as my current plan
                  </button>
                  <button className="btn" onClick={() => use('option')}>
                    Add as an enrollment option
                  </button>
                </div>
              </div>
            )}
            {final?.ok && <RulesView rules={final.rules} title="Rules read from the document" />}
          </div>
        )}
      </section>
    </>
  );
}

function RulesView({ rules, title }: { rules: PlanRules; title: string }) {
  if (rules.kind !== 'insurance')
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p>{rules.name}</p>
      </section>
    );
  const s = rules.sections;
  return (
    <section className="panel stack">
      <div>
        <h2>{title}</h2>
        <p className="muted">
          {rules.name}, rules version {rules.version}
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Plan pays</th>
              {CLASSES.map((c) => (
                <th scope="col" key={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['inNetwork', 'outOfNetwork'] as const).map((n) => (
              <tr key={n}>
                <td>{n === 'inNetwork' ? 'In network' : 'Out of network'}</td>
                {CLASSES.map((c) => (
                  <td key={c} className="num">
                    {pct(rules.coinsurance[n][c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: 6 }}>
        <li>
          Annual max {usd(rules.annualMax)}; deductible {usd(rules.deductible.amount)} on {rules.deductible.appliesTo.join(' and ')} care. <cite className="muted">{s.annualMax}</cite>
        </li>
        <li>
          Premium {usd(rules.premiumMonthly)} a month{rules.premiumPreTax ? ', pre-tax' : ''}.
        </li>
        <li>
          Out of network: {rules.outOfNetwork.basis === 'mac' ? 'maximum allowable charge' : `${rules.outOfNetwork.percentile}th percentile of usual and customary fees`}. <cite className="muted">{s.outOfNetwork}</cite>
        </li>
        {rules.maxRewards && (
          <li>
            MaxRewards: plan payments of {usd(rules.maxRewards.threshold)} or less in a year add {usd(rules.maxRewards.rolloverAmount)} (+{usd(rules.maxRewards.inNetworkBonus)} if all in network) to next year's max, deposited on day {rules.maxRewards.depositDay}, up to {usd(rules.maxRewards.accountLimit)}. <cite className="muted">{s.maxRewards}</cite>
          </li>
        )}
        {!rules.preventiveCountsTowardMax && <li>Preventive care doesn't count against the annual max. <cite className="muted">{s.preventiveMax}</cite></li>}
        {rules.alternateBenefit && <li>Back-tooth tooth-colored fillings are paid at the silver-filling rate. <cite className="muted">{s.alternateBenefit}</cite></li>}
        {rules.q4DeductibleCarryover && <li>Deductible paid in October to December also counts toward next year. <cite className="muted">{s.q4Carryover}</cite></li>}
        {rules.frequencyLimits.map((f) => (
          <li key={f.id}>{f.label}</li>
        ))}
      </ul>
    </section>
  );
}
