import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ConsentDialog } from "../auth/ConsentDialog";
import { useAuth } from "../auth/auth";
import { useAppStore } from "../store";
import { USE_MOCKS } from "../api";
import { useBootstrap } from "../hooks/useBootstrap";
import { AuditDrawer } from "./AuditDrawer";
import { ErrorBoundary } from "./ErrorBoundary";
import { DemoPanel } from "./DemoPanel";
import { EstimateFooter } from "./EstimateFooter";
import { ReminderToast } from "./ReminderToast";
import { TopBar } from "./TopBar";
export function AppShell() {
  const authSub = useAuth((s) => s.claims?.sub);
  const demoPrices = useAppStore((s) =>
    s.profile.procedures.some(
      (p) =>
        p.feeSource?.kind === "demo" ||
        (!p.feeSource && s.profile.fees[p.cdt]?.source?.kind === "demo"),
    ),
  );
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const show = () => setSaveError(true);
    window.addEventListener("ting:saveerror", show);
    return () => window.removeEventListener("ting:saveerror", show);
  }, []);
  const { session, profileStatus, retryProfile } = useBootstrap();
  const [auditOpen, setAuditOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <TopBar
        session={session}
        onOpenAudit={() => setAuditOpen(true)}
        auditOpen={auditOpen}
      />
      <ConsentDialog />
      <main
        id="main"
        className="member-content page-inset mx-auto w-full max-w-6xl flex-1"
      >
        {(USE_MOCKS || !authSub || demoPrices) && (
          <p className="mb-6 border-l-2 border-brand-600 pl-3 text-xs text-muted">
            {USE_MOCKS || !authSub
              ? "Sample account. Plans, providers and default prices are illustrative."
              : "Sample prices remain in this estimate. Replace them with your dentist’s quote and confirmed insurer allowance."}{" "}
            {USE_MOCKS
              ? "Edits are saved on this device."
              : "Draft edits are saved in this browser tab."}
          </p>
        )}
        {saveError && (
          <p role="alert" className="mb-5 border-l-2 border-cost pl-3">
            Your browser could not save these edits. Keep this tab open and
            export your treatment plan.
          </p>
        )}
        <ErrorBoundary resetKey={pathname}>
          {profileStatus === "ready" ? (
            <Outlet />
          ) : profileStatus === "loading" ? (
            <div>
              <h1>Your account</h1>
              <p role="status" className="mt-5">
                Loading your dental record…
              </p>
            </div>
          ) : (
            <div>
              <h1>Account unavailable</h1>
              <p role="alert" className="mt-5">
                Could not load your dental record. Sign in through the menu or
                try again.
              </p>
              <button
                className="btn-primary mt-5"
                onClick={() => void retryProfile()}
              >
                Try again
              </button>
            </div>
          )}
        </ErrorBoundary>
      </main>
      <EstimateFooter />
      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} />
      <ReminderToast />
      <DemoPanel />
    </div>
  );
}
