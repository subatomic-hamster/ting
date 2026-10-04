import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "../api";
import { authConfig, signIn, signOut, useAuth } from "../auth/auth";
const members = [
  ["/", "Home"],
  ["/treatment", "Treatment"],
  ["/enroll", "Compare plans"],
  ["/dentists", "Dentists"],
  ["/email", "Messages"],
  ["/habits", "SmileStreak"],
  ["/plan", "Plan rules"],
  ["/onboarding", "My survey"],
];
const partners = [
  ["/admin", "Employer insights"],
  ["/program", "Insurer program"],
  ["/record", "Insurer record"],
  ["/analyst", "Rules review"],
  ["/calibration", "Calibration"],
];
export function TopBar({
  session,
  onOpenAudit,
  auditOpen,
}: {
  session?: Session;
  onOpenAudit: () => void;
  auditOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const claims = useAuth((s) => s.claims);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent | MouseEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        if (e instanceof KeyboardEvent) trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);
  return (
    <header className="no-print border-b border-line bg-white">
      <div ref={ref} className="relative mx-auto max-w-6xl px-4 sm:px-8">
        <div className="flex min-h-[68px] items-center gap-4">
          <NavLink
            to="/"
            aria-label="Ting home"
            className="flex min-h-12 shrink-0 items-center text-brand-600"
          >
            <span className="font-serif text-[34px] leading-none tracking-[-0.055em]">
              Ting<span className="text-[28px]">.</span>
            </span>
          </NavLink>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {members.find(([p]) => p === pathname)?.[1] ?? "Ting"}
          </span>
          <button
            ref={trigger}
            className="btn-secondary"
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open && (
          <nav
            id="main-navigation"
            aria-label="Main"
            className="absolute inset-x-0 top-full z-40 max-h-[80vh] overflow-y-auto border border-line bg-white p-5 shadow-lg"
          >
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {members.map(([to, label]) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center border-b border-line ${isActive ? "font-medium text-brand-700" : "text-ink"}`
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <details className="mt-4">
              <summary>Partner and developer tools</summary>
              <ul>
                {partners.map(([to, label]) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className="flex min-h-12 items-center text-brand-700"
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
              <button
                className="btn-ghost"
                onClick={() => {
                  setOpen(false);
                  onOpenAudit();
                }}
                aria-expanded={auditOpen}
                aria-controls="audit-drawer"
              >
                Audit trail
              </button>
            </details>
            {claims ? (
              <button
                className="btn-secondary mt-4"
                onClick={() =>
                  void signOut().then(() => navigate("/login"))
                }
              >
                Sign out
              </button>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <NavLink to="/signup" className="btn-primary">
                  Create an account
                </NavLink>
                <NavLink to="/login" className="btn-secondary">
                  Sign in
                </NavLink>
                {!!authConfig() && (
                  <button className="btn-ghost" onClick={() => void signIn()}>
                    Employer sign-in (Acme)
                  </button>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-muted">
              {session
                ? `${session.name} · ${session.employer}`
                : "Loading account…"}
            </p>
          </nav>
        )}
      </div>
    </header>
  );
}
