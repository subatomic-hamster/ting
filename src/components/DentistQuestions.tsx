import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useDentistQuestions } from "../hooks/useDentistQuestions";
import { dentistSummary } from "../habits/analytics";
import { SMILESTREAK } from "../habits/program";
import { useHabitStore } from "../habits/store";
import { signIn } from "../auth/auth";
import { useActive, useAppStore, type ActiveSchedule } from "../store";
import { ShareIcon } from "./Icons";

export function DentistQuestions() {
  const questions = useDentistQuestions();
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {questions.map((q) => (
        <li key={q}>{q}</li>
      ))}
    </ol>
  );
}

export function ShareWithDentist({
  compact = false,
  schedule,
  rulesVersion,
}: {
  compact?: boolean;
  schedule?: ActiveSchedule;
  rulesVersion?: string;
}) {
  const current = useActive();
  const active = schedule ?? current;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const share = useMutation({
    mutationFn: async () => {
      const { profile } = useAppStore.getState();
      const habits = useHabitStore.getState();
      const homeCare = habits.consent.shareWithDentist
        ? dentistSummary(habits.sessions, profile.asOf, SMILESTREAK)
        : null;
      return api.createShareLink(active.kind, {
        patientName: (await api.getSession()).name,
        procedures: profile.procedures,
        schedule: active,
        rulesVersion: rulesVersion ?? profile.currentPlan.version,
        homeCare,
      });
    },
  });

  return (
    <div>
      <button
        type="button"
        className={compact ? "btn-secondary" : "btn-primary"}
        onClick={() => share.mutate()}
        disabled={share.isPending}
      >
        <ShareIcon />{" "}
        {share.isPending ? "Creating link…" : "Create dentist share link"}
      </button>
      {share.error && /step_up/.test(share.error.message) && (
        <p className="mt-2 text-xs text-muted">
          For your security, sign in again before sharing your record.{" "}
          <button
            type="button"
            className="font-medium text-brand-700 underline"
            onClick={() =>
              void signIn({
                prompt: "login",
                returnTo: window.location.pathname,
              })
            }
          >
            Sign in again
          </button>
        </p>
      )}
      {share.error && !/step_up/.test(share.error.message) && (
        <p role="alert" className="mt-3">
          Could not create a share link. Please try again.
        </p>
      )}
      {copyError && (
        <p role="alert" className="mt-3">
          Could not copy the link. Select the displayed link and copy it
          manually.
        </p>
      )}
      {share.data && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-brand-50 p-2 text-xs">
          <a
            href={share.data.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 break-all text-brand-700 underline"
          >
            {share.data.url}
          </a>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => {
              setCopyError(false);
              if (!navigator.clipboard) {
                setCopyError(true);
                return;
              }
              void navigator.clipboard
                .writeText(share.data.url)
                .then(() => setCopied(true))
                .catch(() => setCopyError(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
