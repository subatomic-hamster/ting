import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ConsentDialog } from '../auth/ConsentDialog';
import { useBootstrap } from '../hooks/useBootstrap';
import { AuditDrawer } from './AuditDrawer';
import { ErrorBoundary } from './ErrorBoundary';
import { DemoPanel } from './DemoPanel';
import { EstimateFooter } from './EstimateFooter';
import { ReminderToast } from './ReminderToast';
import { TopBar } from './TopBar';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/treatment', label: 'Treatment' },
  { to: '/enroll', label: 'Enroll' },
  { to: '/dentists', label: 'Dentists' },
  { to: '/plan', label: 'Plan rules' },
  { to: '/habits', label: 'SmileStreak' },
  { to: '/onboarding', label: 'Get started' },
  { to: '/admin', label: 'Employer' },
  { to: '/program', label: 'Lincoln view' },
  { to: '/analyst', label: 'Rules review' },
];

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
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
          {NAV.map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
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
