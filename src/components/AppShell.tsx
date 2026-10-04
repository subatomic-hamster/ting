import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ConsentDialog } from '../auth/ConsentDialog';
import { useBootstrap } from '../hooks/useBootstrap';
import { AuditDrawer } from './AuditDrawer';
import { ErrorBoundary } from './ErrorBoundary';
import { DemoPanel } from './DemoPanel';
import { EstimateFooter } from './EstimateFooter';
import { ChevronIcon } from './Icons';
import { ReminderToast } from './ReminderToast';
import { TopBar } from './TopBar';

// The member's journey. Employer and insurer screens sit in one menu so the main nav stays the product.
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/treatment', label: 'Treatment' },
  { to: '/enroll', label: 'Enroll' },
  { to: '/dentists', label: 'Dentists' },
  { to: '/email', label: 'Email' },
  { to: '/habits', label: 'SmileStreak' },
  { to: '/plan', label: 'Plan rules' },
];

const PARTNER_NAV = [
  { to: '/admin', label: 'Employer insights' },
  { to: '/program', label: 'Insurer view (SmileStreak)' },
  { to: '/record', label: 'Insurer record' },
  { to: '/analyst', label: 'Rules review' },
  { to: '/calibration', label: 'Winnow calibration' },
];

function PartnerMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const active = PARTNER_NAV.some((n) => pathname.startsWith(n.to));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors ${
          active ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'
        }`}
      >
        <span className="hidden sm:inline">For employers &amp; insurers</span>
        <span className="sm:hidden">Partners</span>
        <ChevronIcon className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="absolute top-full right-0 z-40 mt-1 w-60 rounded-xl border border-line bg-white p-1 shadow-lg">
          {PARTNER_NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink hover:bg-brand-50'}`
                }
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AppShell() {
  const { session } = useBootstrap();
  const [auditOpen, setAuditOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar session={session} onOpenAudit={() => setAuditOpen(true)} auditOpen={auditOpen} />
      <ConsentDialog />
      <nav aria-label="Main" className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-3 sm:px-6">
          <ul className="flex min-w-0 flex-1 overflow-x-auto">
            {NAV.map((n) => (
              <li key={n.to} className="shrink-0">
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `block border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <PartnerMenu />
        </div>
      </nav>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <EstimateFooter />
      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} />
      <ReminderToast />
      <DemoPanel />
    </div>
  );
}
