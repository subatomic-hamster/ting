import { USE_MOCKS } from "../api";
import { Link } from "react-router-dom";
import { LeftOnTableBanner } from "../components/LeftOnTableBanner";
import { ActivityFeed } from "../components/ActivityFeed";
import { AskTing } from "../components/AskTing";
import { DeductibleBar } from "../components/DeductibleBar";
import { EnrollmentCard } from "../components/EnrollmentCard";
import { FsaCountdown } from "../components/FsaCountdown";
import { MaxGauge } from "../components/MaxGauge";
import { PlanPicker } from "../components/PlanPicker";
import { RemindersCard } from "../components/RemindersCard";
import { Timeline } from "../components/Timeline";
import { PageHeader, Section } from "../components/Section";
import { maxGauges } from "../engine/helpers";
import { memberFor } from "../data/members";
import { formatDate, formatMoney } from "../lib/format";
import { isEnrollmentWindow, yearOf } from "../lib/dates";
import { useActive, useAppStore, useProfile } from "../store";
export default function Dashboard() {
  const persona = useAppStore((s) => memberFor(s.personaId));
  const profile = useProfile();
  const active = useActive();
  const [gauge] = maxGauges(profile, active);
  return (
    <div className="space-y-8">
      <PageHeader
        title={USE_MOCKS ? `Hi ${persona.name}` : "Your dental care"}
        subtitle="Plan your dental care and understand what you may pay."
      />
      <section
        aria-labelledby="overview-title"
        className="border-l-2 border-brand-600 pl-5"
      >
        <h2 id="overview-title" className="text-base">
          Your planned care
        </h2>
        <p className="tabular mt-2 text-[32px] leading-[38px] font-medium">
          {formatMoney(active.expectedOwes)}
        </p>
        <p className="mt-2 text-base text-muted">
          Estimated amount you pay across {yearOf(profile.asOf)} and{" "}
          {yearOf(profile.asOf) + 1}. {profile.procedures.length} treatment
          items.{" "}
          {active.kind === "custom"
            ? "Your edited dates"
            : `${active.kind[0].toUpperCase()}${active.kind.slice(1)} schedule`}
          .
        </p>
        {active.lines.some((l) => l.pricingWarning) && (
          <p className="mt-3 text-base">
            Some insurer allowances are missing. Those items budget the full
            dentist fee.
          </p>
        )}
        <Link to="/treatment" className="btn-primary mt-5 w-full sm:w-auto">
          {profile.procedures.length
            ? "Review treatment and dates"
            : "Add your treatment"}
        </Link>
      </section>
      {isEnrollmentWindow(profile.asOf) && <EnrollmentCard variant="compact" />}
      <LeftOnTableBanner />
      <Section
        title="Treatment timeline"
        id="timeline"
        actions={
          <Link to="/treatment" className="btn-ghost">
            Details
          </Link>
        }
      >
        <Timeline compact />
      </Section>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Benefits this year" id="max">
          <p className="mb-4 text-base">
            <PlanPicker /> · as of {formatDate(profile.asOf, { year: true })}
          </p>
          {gauge && <MaxGauge gauge={gauge} />}
          <div className="mt-6">
            <DeductibleBar />
          </div>
        </Section>
        <Section title="Your FSA" id="year">
          <FsaCountdown />
          <Link to="/enroll" className="btn-ghost mt-4">
            Compare next year’s plans
          </Link>
        </Section>
      </div>
      <Section title="Ask about your plan" id="ask">
        <AskTing />
      </Section>
      <RemindersCard />
      <details className="border-t border-line" id="activity">
        <summary className="text-brand-700">
          Claims and account activity
        </summary>
        <ActivityFeed />
      </details>
      <nav
        aria-label="More account tasks"
        className="grid border-t border-line sm:grid-cols-2"
      >
        <Link to="/habits" className="btn-ghost justify-start">
          Brushing rewards and privacy
        </Link>
        <Link to="/onboarding" className="btn-ghost justify-start">
          Set up your treatment plan
        </Link>
      </nav>
    </div>
  );
}
