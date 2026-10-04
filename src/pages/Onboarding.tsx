import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useAccount } from "../auth/useAccount";
import { OnboardingStepper } from "../components/OnboardingStepper";
import { PageHeader } from "../components/Section";
import { SurveyWizard } from "../components/SurveyWizard";

export default function Onboarding() {
  const { record, memberId } = useAccount();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: api.saveMember,
    onSuccess: (next) => {
      qc.setQueryData(["member", memberId], next);
      setSaved(true);
    },
  });
  // Sample members keep the short survey; a signed-up member edits their sign-up answers.
  if (!record)
    return (
      <div>
        <PageHeader
          title="Get started"
          subtitle="A short survey about your care, coverage and where you expect to live."
        />
        <OnboardingStepper />
      </div>
    );
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My survey"
        subtitle="Change an answer and Ting rebuilds your dental year and plan advice. Work you added stays."
      />
      {saved && (
        <p role="status" className="mb-5 border-l-2 border-brand-600 pl-3">
          Saved. Your profile and plan advice now use these answers.
        </p>
      )}
      <SurveyWizard
        key={record.createdAt + JSON.stringify(record.survey)}
        initial={{ planId: record.planId, survey: record.survey }}
        busy={save.isPending}
        error={save.isError ? "Couldn't save your answers. Try again." : undefined}
        onSubmit={(r) => {
          setSaved(false);
          save.mutate({ name: record.name, currentDentistId: record.currentDentistId, ...r });
        }}
      />
    </div>
  );
}
