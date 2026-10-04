import { OnboardingStepper } from "../components/OnboardingStepper";
import { PageHeader } from "../components/Section";

export default function Onboarding() {
  return (
    <div>
      <PageHeader
        title="Get started"
        subtitle="Bring your dentist’s recommendations and any quoted fees."
      />
      <OnboardingStepper />
    </div>
  );
}
