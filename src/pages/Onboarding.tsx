import { OnboardingStepper } from '../components/OnboardingStepper';
import { PageHeader } from '../components/Section';

export default function Onboarding() {
  return (
    <div>
      <PageHeader title="Get started" subtitle="Three questions. Nothing else until it saves you money." />
      <OnboardingStepper />
    </div>
  );
}
