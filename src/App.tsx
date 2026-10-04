import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import AuthCallback from './auth/AuthCallback';
import Admin from './pages/Admin';
import Analyst from './pages/Analyst';
import Calibration from './pages/Calibration';
import EmailPage from './pages/Email';
import CarrierRecord from './pages/CarrierRecord';
import Dashboard from './pages/Dashboard';
import Dentists from './pages/Dentists';
import Enroll from './pages/Enroll';
import Habits from './pages/Habits';
import Onboarding from './pages/Onboarding';
import PlanRules from './pages/PlanRules';
import Program from './pages/Program';
import Share from './pages/Share';
import Treatment from './pages/Treatment';
import TryIt from './pages/TryIt';

export default function App() {
  return (
    <Routes>
      {/* Public dentist handoff: no app chrome. */}
      <Route path="/share/:token" element={<Share />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      {/* Title-slide QR code for judges. */}
      <Route path="/try" element={<TryIt />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="treatment" element={<Treatment />} />
        <Route path="enroll" element={<Enroll />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="dentists" element={<Dentists />} />
        <Route path="plan" element={<PlanRules />} />
        <Route path="habits" element={<Habits />} />
        <Route path="program" element={<Program />} />
        <Route path="admin" element={<Admin />} />
        <Route path="analyst" element={<Analyst />} />
        <Route path="calibration" element={<Calibration />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="record" element={<CarrierRecord />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
