import { useState } from 'react';
import { DemoDataPill } from '../components/DemoDataPill';
import { PageHeader, Section } from '../components/Section';
import { programEconomics, type ProgramCohort } from '../habits/analytics';
import cohort from '../habits/programCohort.json';
import { formatMoney, formatPercent } from '../lib/format';

/** Aggregates only. Groups smaller than this are hidden so no one can be identified. */
const MIN_GROUP = 20;

/** Lincoln's view of SmileStreak: group-level counts and honest program economics. */
export default function Program() {
  const c = cohort as ProgramCohort;
  const [attribution, setAttribution] = useState(0.5);
  const e = programEconomics(c, attribution);
  const shown = c.groups.filter((g) => g.n >= MIN_GROUP);
  const hidden = c.groups.length - shown.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="SmileStreak: Lincoln view"
        subtitle="Aggregate data only, in groups of 20 or more. No individual sessions, times or device IDs ever reach Lincoln."
      >
        <DemoDataPill label="Demo cohort" />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title="Participation" value={formatPercent(e.participationRate)} detail={`${c.participants} of ${c.eligibleMembers} eligible members`} />
        <Kpi
          title="Two cleanings a year"
          value={`${formatPercent(c.preventiveCompletion.participants)} vs ${formatPercent(c.preventiveCompletion.nonParticipants)}`}
          detail="participants vs everyone else"
        />
        <Kpi
          title="Restorative claims per 1,000"
          value={`${c.restorativeClaimsPer1000.participants} vs ${c.restorativeClaimsPer1000.nonParticipants}`}
          detail="fillings, root canals and crowns"
        />
      </div>

      <Section title="Does it pay for itself?" id="economics">
        <p className="text-sm text-muted">
          Participants choose to join, and people who already brush well are the likeliest to sign up. So only part of their lower claim
          rate is caused by the program. Set that share below; a randomized pilot would measure it.
        </p>
        <label className="mt-4 block text-sm">
          <span className="font-medium">Share of the claims gap caused by the program: {formatPercent(attribution)}</span>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={attribution}
            onChange={(ev) => setAttribution(Number(ev.target.value))}
            className="mt-2 w-full max-w-md"
            aria-label="Share of the claims gap caused by the program"
          />
        </label>
        <dl className="mt-4 grid max-w-xl gap-y-1.5 text-sm">
          <Row label="Restorative claims avoided if the whole gap were real" value={formatMoney(e.rawAvoidedCost)} />
          <Row label={`Avoided claims at ${formatPercent(attribution)} attribution`} value={formatMoney(e.attributedAvoidedCost)} good />
          <Row label="Extra cleanings paid at 100% (intended)" value={`−${formatMoney(e.extraCleaningsCost)}`} />
          <Row label="Device subsidies" value={`−${formatMoney(e.deviceCost)}`} />
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold">
            <dt>Net for Lincoln this year</dt>
            <dd className={`tabular ${e.lincolnNet >= 0 ? 'text-save' : 'text-cost'}`}>{formatMoney(e.lincolnNet, { signed: true })}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">
          Break-even: the program pays for itself if at least <strong>{formatPercent(e.breakEvenAttribution)}</strong> of the gap is caused by it.
          Credits ({formatMoney(e.employerCreditCost)} this year) are funded from the employer’s wellness budget.
        </p>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="By employer group" id="groups">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Group</th>
                <th className="py-1.5 text-right font-medium">Members</th>
                <th className="py-1.5 text-right font-medium">Joined</th>
                <th className="py-1.5 text-right font-medium">Twice a day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((g) => (
                <tr key={g.id}>
                  <td className="py-2">{g.name}</td>
                  <td className="tabular py-2 text-right">{g.n}</td>
                  <td className="tabular py-2 text-right">{formatPercent(g.participationRate)}</td>
                  <td className="tabular py-2 text-right">{formatPercent(g.twiceDailyRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-line p-3 text-sm text-muted">
              {hidden} group{hidden > 1 ? 's' : ''} hidden: fewer than {MIN_GROUP} members, so results could identify individuals.
            </p>
          )}
        </Section>

        <Section title="What Lincoln receives" id="data-flow">
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Receives:</strong> monthly counts per employer group (20+ members), from members who allow it, and each member’s credit
              total so it can be paid.
            </li>
            <li>
              <strong>Never receives:</strong> individual sessions, timestamps, device IDs or location.
            </li>
            <li>
              <strong>Never used for:</strong> pricing, underwriting, claim decisions or anything about an individual. Rewards only; no
              surcharges.
            </li>
            <li>
              <strong>Before launch:</strong> Lincoln actuarial and compliance review against wellness-incentive rules (opt-in, reasonable
              alternative, cap, yearly re-qualification) and state filings.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Kpi({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="card">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <p className="tabular mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </article>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular ${good ? 'text-save' : ''}`}>{value}</dd>
    </div>
  );
}
