import type { ReactNode } from "react";
import { DemoDataPill } from "../components/DemoDataPill";
import { ConsentCard } from "../components/habits/ConsentCard";
import { DeviceCard } from "../components/habits/DeviceCard";
import { HabitEstimateCard } from "../components/habits/HabitEstimateCard";
import { HomeCareSummary } from "../components/habits/HomeCareSummary";
import { LiveBrushPanel } from "../components/habits/LiveBrushPanel";
import { NextYearCard } from "../components/habits/NextYearCard";
import { ProfileSyncCard } from "../components/habits/ProfileSyncCard";
import { PrivacyControls } from "../components/habits/PrivacyControls";
import { RewardsCard } from "../components/habits/RewardsCard";
import { StreakCalendar } from "../components/habits/StreakCalendar";
import { ValueMap } from "../components/habits/ValueMap";
import { ChevronIcon } from "../components/Icons";
import { PageHeader, Section } from "../components/Section";
import { memberFor } from "../data/members";
import { useSmileStreak } from "../habits/hooks";
import { useHabitStore } from "../habits/store";
import { useAppStore } from "../store";

export default function Habits() {
  const persona = useAppStore((s) => memberFor(s.personaId));
  const consent = useHabitStore((s) => s.consent);
  const { program, rewards, adherence, signal, streak, calendar, dentist } =
    useSmileStreak();
  const credit = consent.optedIn ? rewards.earned : rewards.wouldEarn;

  return (
    <div className="space-y-5">
      <PageHeader
        title="SmileStreak"
        subtitle="Earn credits for good brushing habits. Rewards do not change your premium or claim decisions."
      >
        <DemoDataPill label="Demo program terms" />
      </PageHeader>

      {!consent.optedIn && <ConsentCard rewards={rewards} />}

      <ProfileSyncCard signal={signal} />

      <div className="grid gap-5 lg:grid-cols-5">
        <Section className="min-w-0 lg:col-span-3" title="Brush" id="live">
          <LiveBrushPanel />
          <div className="mt-4 border-t border-line pt-4" id="device">
            <h3 className="mb-2 text-sm font-semibold">Your brush</h3>
            <DeviceCard />
          </div>
        </Section>
        <Section className="min-w-0 lg:col-span-2" title="Rewards" id="rewards">
          <RewardsCard rewards={rewards} program={program} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          className="min-w-0"
          title="Streak"
          id="streak"
          actions={
            !consent.optedIn ? (
              <span className="text-xs text-muted">starts when you opt in</span>
            ) : undefined
          }
        >
          <StreakCalendar days={calendar} streak={streak} />
        </Section>
        <Section
          className="min-w-0"
          title="Plan costs with your credit"
          id="next-year"
        >
          <NextYearCard credit={credit} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          className="min-w-0"
          title="Discuss treatment with your dentist"
          id="estimate"
          eyebrow="Optional"
        >
          <HabitEstimateCard adherence={adherence} />
        </Section>
        <Section className="min-w-0" title="Your data, your call" id="privacy">
          <PrivacyControls />
        </Section>
      </div>

      <Collapsible
        title="What your dentist sees"
        id="dentist"
        hint={
          consent.shareWithDentist
            ? "Shared on your visit handoff page"
            : "Preview: not shared"
        }
      >
        {dentist ? (
          <HomeCareSummary summary={dentist} patientName={persona.name} />
        ) : (
          <p className="text-sm text-muted">
            Nothing to summarize yet. After a few days of brushing, your dentist
            can see a 30-day summary if you share it.
          </p>
        )}
      </Collapsible>

      <Collapsible
        title="Who benefits from this data"
        id="value"
        hint="You · your dentist · your insurer"
      >
        <ValueMap
          rewards={rewards}
          streak={streak}
          dentist={dentist}
          optedIn={consent.optedIn}
          sharedWithDentist={consent.shareWithDentist}
        />
      </Collapsible>
    </div>
  );
}

/** A lower-priority section, closed until asked for. */
function Collapsible({
  title,
  id,
  hint,
  children,
}: {
  title: string;
  id: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="card group min-w-0" id={id}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          {hint}
          <ChevronIcon className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
