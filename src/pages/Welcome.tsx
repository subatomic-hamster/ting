import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/auth';
import { useAccount } from '../auth/useAccount';
import { SurveyWizard } from '../components/SurveyWizard';
import { AuthLayout } from './Login';

/** Step two of sign-up: the onboarding survey, which builds the member's starting profile. */
export default function Welcome() {
  const kind = useAuth((s) => s.kind);
  const { status, memberId } = useAccount();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(() => {
    try {
      return sessionStorage.getItem('ting.signupName') ?? '';
    } catch {
      return '';
    }
  });
  const save = useMutation({
    mutationFn: api.saveMember,
    onSuccess: (record) => {
      qc.setQueryData(['member', memberId], record);
      try {
        sessionStorage.removeItem('ting.signupName');
      } catch {
        /* nothing to clean up */
      }
      navigate('/?welcome=1');
    },
  });
  if (kind !== 'password' && kind !== 'local') return <Navigate to="/signup" replace />;
  if (status === 'member') return <Navigate to="/?welcome=1" replace />;
  return (
    <AuthLayout title="Set up your dental year" subtitle="Six quick questions. Ting uses them to load your plan and estimate what your year will cost.">
      {status === 'loading' ? (
        <p role="status">Loading your account…</p>
      ) : (
        <>
          <label className="mb-6 block">
            <span className="font-medium">What should we call you?</span>
            <input className="mt-1 block w-full rounded-lg border border-line px-3 py-2" autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <SurveyWizard
            busy={save.isPending}
            error={
              !name.trim()
                ? 'Add your name above to finish.'
                : save.isError
                  ? `Couldn't save your answers (${save.error instanceof Error ? save.error.message : 'unknown error'}). They're still here: try again.`
                  : undefined
            }
            onSubmit={(r) => name.trim() && save.mutate({ name: name.trim(), ...r })}
          />
        </>
      )}
    </AuthLayout>
  );
}
