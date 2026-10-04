import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "./auth";
import { useAppStore } from "../store";
import { clearDraft } from "../lib/drafts";

export const CONSENT_VERSION = "2026-10";

/** First sign-in: what Ting reads, what it never shares with the employer, and how to delete everything. */
export function ConsentDialog() {
  const client = useQueryClient();
  const claims = useAuth((s) => s.claims);
  const kind = useAuth((s) => s.kind);
  // About the member's own dental data; admins and analysts never have any. Members who signed up with a
  // password agreed to the same terms on the sign-up form.
  const isMember =
    !!claims &&
    kind !== "password" &&
    kind !== "local" &&
    !claims.groups.includes("employer_admin") &&
    !claims.groups.includes("lincoln_analyst");
  const consent = useQuery({
    queryKey: ["consent", claims?.sub],
    queryFn: () => api.getConsent(),
    enabled: isMember,
  });
  const accept = useMutation({
    mutationFn: () => api.giveConsent(CONSENT_VERSION),
    onSuccess: () => consent.refetch(),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteMyData(),
    onSuccess: () => {
      const state = useAppStore.getState();
      clearDraft("server-profile", state.personaId);
      useAppStore.setState({
        liveClaims: [],
        liveClaimIds: [],
        claimChecks: [],
        scheduledReminders: null,
        dismissedReminders: [],
        profile: {
          ...state.profile,
          ledger: {
            ...state.profile.ledger,
            maxUsed: 0,
            deductibleMet: 0,
            orthoUsed: 0,
            rolloverBalance: 0,
            pastYears: [],
            history: state.profile.ledger.history.filter(
              (h) => h.source === "user",
            ),
          },
        },
      });
      void client.invalidateQueries({ queryKey: ["ledger"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
      void client.invalidateQueries({ queryKey: ["consent"] });
    },
  });

  const panel = useRef<HTMLDivElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);
  const open =
    isMember && !!consent.data && consent.data.version !== CONSENT_VERSION;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    acceptButton.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]',
        ) ?? [],
      );
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [open]);
  if (isMember && consent.isError)
    return (
      <div role="alert" className="p-5">
        Could not load your privacy choices.{" "}
        <button
          className="btn-secondary"
          onClick={() => void consent.refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4"
    >
      <div
        ref={panel}
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto"
      >
        <h2 id="consent-title" className="text-lg font-semibold">
          Before you start
        </h2>
        <p className="mt-1 text-sm text-muted">
          You signed in with your company account. Your dental information stays
          with your insurer.
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">What Ting reads</dt>
            <dd className="text-muted">
              Your dental plan, your claims, and anything you type, say or
              upload. Nothing from your inbox.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">What your employer sees</dt>
            <dd className="text-muted">
              Only de-identified totals for groups of 20 or more. Never your
              procedures, claims or answers.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Deleting stored claims</dt>
            <dd className="text-muted">
              This action removes stored claims, current year-end reminders and
              this consent. Treatment documents, brushing sessions and
              previously shared copies are managed separately.
            </dd>
          </div>
        </dl>
        {(accept.isError || remove.isError) && (
          <p role="alert" className="mt-3 text-cost">
            Could not{" "}
            {accept.isError ? "save your consent" : "delete your data"}. Try
            again.
          </p>
        )}
        {remove.isSuccess && (
          <p className="mt-3 text-sm text-save">
            Stored claims, current year-end reminders and consent were deleted.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            ref={acceptButton}
            className="btn-primary"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
          >
            {accept.isPending ? "Saving…" : "I agree"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            Delete claims, reminders and consent
          </button>
        </div>
      </div>
    </div>
  );
}
