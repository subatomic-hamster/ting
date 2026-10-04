import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { programEconomics, type DentistSummary, type ProgramCohort } from '../../habits/analytics';
import { QUADRANTS } from '../../habits/program';
import cohort from '../../habits/programCohort.json';
import type { RewardSummary } from '../../habits/types';
import { formatMoney, formatPercent } from '../../lib/format';

const DEFAULT_ATTRIBUTION = 0.5;

/** One screen that answers "who gets what from this data?" with live numbers. */
export function ValueMap({
  rewards,
  streak,
  dentist,
  optedIn,
  sharedWithDentist,
}: {
  rewards: RewardSummary;
  streak: number;
  dentist: DentistSummary | null;
  optedIn: boolean;
  sharedWithDentist: boolean;
}) {
  const c = cohort as ProgramCohort;
  const econ = programEconomics(c, DEFAULT_ATTRIBUTION);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Column title="You" accent="border-t-brand-500">
        <li>
          <strong>{formatMoney(optedIn ? rewards.earned : rewards.wouldEarn)}</strong> {optedIn ? 'earned' : 'available'} this year, paid
          as an FSA/HSA deposit or added to your rollover.
        </li>
        <li>{optedIn ? `${streak}-day streak, with coaching on the areas you miss.` : 'Live coaching on the areas you miss.'}</li>
        <li>A more personal estimate: good habits can lower the odds Ting assumes for “maybe” fillings.</li>
        <li>Your premium never goes up, whatever the data says.</li>
      </Column>

      <Column title="Your dentist" accent="border-t-sched">
        {dentist && sharedWithDentist ? (
          <li>
            Sees your 30-day summary before the visit: twice a day on <strong>{formatPercent(dentist.twiceDailyRate)}</strong> of days
            {dentist.weakest && dentist.sectorCount === 4 ? (
              <>
                , weakest area <strong>{QUADRANTS[dentist.weakest.index].toLowerCase()}</strong>
              </>
            ) : null}
            , {dentist.pressureWarningsPerWeek} pressure warnings a week.
          </li>
        ) : (
          <li>Can see a 30-day summary before your visit, if you choose to share it (it’s off now).</li>
        )}
        <li>Coaches the exact spot you miss instead of giving generic advice.</li>
        <li>Spots heavy brushing early, before gums recede.</li>
        <li>Confirms home care for patients without a smart brush, so everyone can earn.</li>
      </Column>

      <Column title="Insurer" accent="border-t-roll">
        <li>
          Group counts only (20+ people): cleanings completed by participants{' '}
          <strong>{formatPercent(c.preventiveCompletion.participants)}</strong> vs{' '}
          <strong>{formatPercent(c.preventiveCompletion.nonParticipants)}</strong> (demo cohort).
        </li>
        <li>
          Restorative claims {econ.restorativeGapPer1000} fewer per 1,000 participants. Pays for itself if at least{' '}
          <strong>{formatPercent(econ.breakEvenAttribution)}</strong> of that gap is caused by the program, which a pilot would test.
        </li>
        <li>Engaged members and employers who renew. Never used for pricing, underwriting or claims.</li>
        <li>
          <Link to="/program" className="font-medium text-brand-700 underline">
            Open the insurer view
          </Link>
        </li>
      </Column>
    </div>
  );
}

function Column({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-t-4 border-line bg-white p-4 ${accent}`}>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">{children}</ul>
    </div>
  );
}
