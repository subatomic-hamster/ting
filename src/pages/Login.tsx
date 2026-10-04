import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthError, passwordAuth, signInWithPassword, signUpWithPassword, useAuth } from '../auth/auth';
import { enterSampleMode } from '../auth/useAccount';
import { useAppStore } from '../store';

/** Chrome for the pages before the app: the wordmark and one card. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-start bg-paper px-4 py-10 sm:place-items-center">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" aria-label="Ting home" className="font-serif text-[40px] leading-none tracking-[-0.055em] text-brand-600">
          Ting<span className="text-[32px]">.</span>
        </Link>
        <div className="card mt-6 bg-white">
          <h1>{title}</h1>
          {subtitle && <div className="mt-2 text-muted">{subtitle}</div>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-4 text-xs text-muted">Sample plans and dentists; educational estimates, not insurance or tax advice.</p>
      </div>
    </main>
  );
}

function SampleLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="btn-ghost mt-2 w-full"
      onClick={() => {
        enterSampleMode();
        useAppStore.getState().loadPersona('dale');
        navigate('/');
      }}
    >
      Explore a sample member instead
    </button>
  );
}

export function CredentialsForm({ mode }: { mode: 'signIn' | 'signUp' }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const signUp = mode === 'signUp';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      if (signUp) {
        await signUpWithPassword(email, password);
        try {
          sessionStorage.setItem('ting.signupName', name.trim());
        } catch {
          /* the survey asks again */
        }
        navigate('/welcome');
      } else {
        await signInWithPassword(email, password);
        const next = new URLSearchParams(window.location.search).get('next');
        navigate(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
      {signUp && (
        <label className="block">
          <span className="font-medium">First name</span>
          <input
            className="mt-1 block w-full rounded-lg border border-line px-3 py-2"
            autoComplete="given-name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <label className="block">
        <span className="font-medium">Email</span>
        <input
          type="email"
          className="mt-1 block w-full rounded-lg border border-line px-3 py-2"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-medium">Password</span>
        <input
          type="password"
          className="mt-1 block w-full rounded-lg border border-line px-3 py-2"
          autoComplete={signUp ? 'new-password' : 'current-password'}
          required
          minLength={signUp ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={signUp ? 'password-rule' : undefined}
        />
        {signUp && (
          <span id="password-rule" className="mt-1 block text-sm text-muted">
            At least 8 characters, with a lowercase letter and a number.
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="border-l-2 border-cost pl-3">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy || (signUp && !name.trim())}>
        {busy ? (signUp ? 'Creating your account…' : 'Signing in…') : signUp ? 'Create account' : 'Sign in'}
      </button>
      {signUp && (
        <p className="text-sm text-muted">
          By creating an account you agree that Ting reads your dental plan, your claims and anything you type, upload or email to it, never your
          inbox. Your employer sees only de-identified totals for groups of 20 or more. You can delete your data anytime. Your email is also how
          Ting recognizes messages you send to its inbox.
        </p>
      )}
    </form>
  );
}

export default function Login() {
  const claims = useAuth((s) => s.claims);
  if (claims) return <Navigate to="/" replace />;
  const mode = passwordAuth();
  return (
    <AuthLayout title="Sign in" subtitle="See what your dental work will cost and when to do it.">
      {mode ? <CredentialsForm mode="signIn" /> : <p role="alert">Sign-in is not available on this site.</p>}
      <p className="mt-5 text-center">
        New to Ting?{' '}
        <Link to="/signup" className="font-medium text-brand-700 underline">
          Create an account
        </Link>
      </p>
      <SampleLink />
    </AuthLayout>
  );
}

export function Signup() {
  const claims = useAuth((s) => s.claims);
  if (claims) return <Navigate to="/welcome" replace />;
  return (
    <AuthLayout title="Create your account" subtitle="Two minutes: an account, then a short survey that sets up your plan and your dental year.">
      {passwordAuth() ? <CredentialsForm mode="signUp" /> : <p role="alert">Sign-up is not available on this site.</p>}
      <p className="mt-5 text-center">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 underline">
          Sign in
        </Link>
      </p>
      <SampleLink />
    </AuthLayout>
  );
}
