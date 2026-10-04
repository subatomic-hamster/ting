import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPersonaId } from '../data/personas';
import { useAppStore } from '../store';
import { completeSignIn } from './auth';

/** Lands here from the hosted sign-in, swaps the code for tokens, and opens the member's own record. */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const state = q.get('state') ?? '';
    if (!code) {
      setError(q.get('error_description') ?? 'Sign-in was cancelled.');
      return;
    }
    completeSignIn(code, state)
      .then((claims) => {
        if (claims.persona && isPersonaId(claims.persona)) useAppStore.getState().loadPersona(claims.persona);
        navigate(claims.returnTo ?? (claims.groups.includes('employer_admin') ? '/admin' : claims.groups.includes('lincoln_analyst') ? '/analyst' : '/'), { replace: true });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md p-8 text-center text-sm">
      {error ? (
        <>
          <p className="text-warn">{error}</p>
          <a href="/" className="mt-3 inline-block font-medium text-brand-700 underline">
            Back to Ting
          </a>
        </>
      ) : (
        <p className="text-muted">Signing you in…</p>
      )}
    </div>
  );
}
