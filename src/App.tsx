import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import Dentists from './pages/Dentists';
import Enroll from './pages/Enroll';
import Onboarding from './pages/Onboarding';
import PlanRules from './pages/PlanRules';
import Share from './pages/Share';
import Treatment from './pages/Treatment';

export default function App() {
  return (
    <Routes>
      {/* Public dentist handoff: no app chrome. */}
      <Route path="/share/:token" element={<Share />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="treatment" element={<Treatment />} />
        <Route path="enroll" element={<Enroll />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="dentists" element={<Dentists />} />
        <Route path="plan" element={<PlanRules />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
