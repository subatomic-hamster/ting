import { OnboardingStepper } from "../components/OnboardingStepper";
import { PageHeader } from "../components/Section";

export default function Onboarding() {
  return (
    <div>
      <PageHeader
        title="Get started"
        subtitle="A short survey about your care, coverage and where you expect to live."
      />
      <OnboardingStepper />
    </div>
  );
}
