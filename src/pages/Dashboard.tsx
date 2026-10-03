import { Link } from 'react-router-dom';
import { ActivityFeed } from '../components/ActivityFeed';
import { DeductibleBar } from '../components/DeductibleBar';
import { DemoDataPill } from '../components/DemoDataPill';
import { EnrollmentCard } from '../components/EnrollmentCard';
import { FsaCountdown } from '../components/FsaCountdown';
import { LeftOnTableBanner } from '../components/LeftOnTableBanner';
import { MaxGauge } from '../components/MaxGauge';
import { SamplePlanNote } from '../components/SamplePlanNote';
import { PageHeader, Section } from '../components/Section';
import { Timeline } from '../components/Timeline';
import { PERSONAS } from '../fixtures/personas';
import { useSmileStreak } from '../habits/hooks';
import { useHabitStore } from '../habits/store';
import { isEnrollmentWindow } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { selectPlan, useAppStore, useResult } from '../store';

export default function Dashboard() {
  const persona = useAppStore((s) => PERSONAS[s.personaId]);
  const asOf = useAppStore((s) => s.asOf);
  const plan = useAppStore(selectPlan);
  const result = useResult();
  const gauge = result.gauges[0];
  const optedIn = useHabitStore((s) => s.consent.optedIn);
  const smile = useSmileStreak();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Hi ${persona.name}`}
        subtitle={
          <>
            {formatDate(asOf, { year: true })} · {plan?.name} plan · you'll pay{' '}
            <strong className="tabular text-ink">{formatMoney(result.activeSchedule.memberTotal)}</strong> for planned work
          </>
        }
      >
        <SamplePlanNote />
      </PageHeader>

      {isEnrollmentWindow(asOf) && <EnrollmentCard variant="compact" />}
      <LeftOnTableBanner />

      <div className="grid gap-5 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Your annual maximum" id="max">
          {gauge && <MaxGauge gauge={gauge} />}
        </Section>
        <Section title="This year" id="year">
          <div className="space-y-5">
            <DeductibleBar />
            <FsaCountdown />
          </div>
        </Section>
      </div>

      <Section
        title="SmileStreak"
        id="smilestreak"
        actions={<Link to="/habits" className="btn-ghost">{optedIn ? 'Open' : 'Learn more'}</Link>}
      >
        {optedIn ? (
          <p className="text-sm">
            <strong className="tabular">{formatMoney(smile.rewards.earned)}</strong> earned of {formatMoney(smile.rewards.cap)} ·{' '}
            <strong className="tabular">{smile.streak}</strong>-day brushing streak
          </p>
        ) : (
          <p className="text-sm text-muted">
            Opt in to share smart-brush data and earn up to {formatMoney(smile.rewards.cap)} a year. Your cleanings already count. Rewards only.
          </p>
        )}
      </Section>

      <Section title="Treatment timeline" id="timeline" actions={<Link to="/treatment" className="btn-ghost">Details</Link>}>
        <Timeline compact />
      </Section>

      <Section title="Activity" id="activity" actions={<DemoDataPill label="Demo claims feed" />}>
        <ActivityFeed />
      </Section>
    </div>
  );
}
