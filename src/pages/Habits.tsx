import { DemoDataPill } from '../components/DemoDataPill';
import { ConsentCard } from '../components/habits/ConsentCard';
import { DeviceCard } from '../components/habits/DeviceCard';
import { HabitEstimateCard } from '../components/habits/HabitEstimateCard';
import { HomeCareSummary } from '../components/habits/HomeCareSummary';
import { LiveBrushPanel } from '../components/habits/LiveBrushPanel';
import { NextYearCard } from '../components/habits/NextYearCard';
import { PrivacyControls } from '../components/habits/PrivacyControls';
import { RewardsCard } from '../components/habits/RewardsCard';
import { StreakCalendar } from '../components/habits/StreakCalendar';
import { ValueMap } from '../components/habits/ValueMap';
import { PageHeader, Section } from '../components/Section';
import { PERSONAS } from '../fixtures/personas';
import { useSmileStreak } from '../habits/hooks';
import { useHabitStore } from '../habits/store';
import { useAppStore } from '../store';

export default function Habits() {
  const persona = useAppStore((s) => PERSONAS[s.personaId]);
  const consent = useHabitStore((s) => s.consent);
  const { program, rewards, adherence, streak, calendar, dentist } = useSmileStreak();
  const credit = consent.optedIn ? rewards.earned : rewards.wouldEarn;

  return (
    <div className="space-y-5">
      <PageHeader
        title="SmileStreak"
        subtitle="Opt in to share brushing data from a smart brush, earn credits for good habits. Rewards only: your premium never goes up."
      >
        <DemoDataPill label="Demo program terms" />
      </PageHeader>

      {!consent.optedIn && <ConsentCard rewards={rewards} />}

      <div className="grid gap-5 lg:grid-cols-5">
        <Section className="min-w-0 lg:col-span-3" title="Brush" id="live">
          <LiveBrushPanel />
        </Section>
        <Section className="min-w-0 lg:col-span-2" title="Rewards" id="rewards">
          <RewardsCard rewards={rewards} program={program} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Section className="min-w-0 lg:col-span-3" title="Your brush" id="device">
          <DeviceCard />
        </Section>
        <Section className="min-w-0 lg:col-span-2" title="Streak" id="streak" actions={!consent.optedIn ? <span className="text-xs text-muted">starts when you opt in</span> : undefined}>
          <StreakCalendar days={calendar} streak={streak} />
        </Section>
      </div>

      <Section className="min-w-0" title="Who benefits from this data" id="value" eyebrow="You · your dentist · Lincoln">
        <ValueMap rewards={rewards} streak={streak} dentist={dentist} optedIn={consent.optedIn} sharedWithDentist={consent.shareWithDentist} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section className="min-w-0" title="A more personal estimate" id="estimate" eyebrow="Optional">
          <HabitEstimateCard adherence={adherence} />
        </Section>
        <Section className="min-w-0" title="Next year, with your credit" id="next-year">
          <NextYearCard credit={credit} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          className="min-w-0"
          title="What your dentist sees"
          id="dentist"
          actions={<span className="text-xs text-muted">{consent.shareWithDentist ? 'Shared on your visit handoff page' : 'Preview: not shared'}</span>}
        >
          {dentist ? (
            <HomeCareSummary summary={dentist} patientName={persona.name} />
          ) : (
            <p className="text-sm text-muted">Nothing to summarize yet. After a few days of brushing, your dentist can see a 30-day summary if you share it.</p>
          )}
        </Section>
        <Section className="min-w-0" title="Your data, your call" id="privacy">
          <PrivacyControls />
        </Section>
      </div>
    </div>
  );
}
