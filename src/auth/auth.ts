// Employer single sign-on: Cognito hosted sign-in, federated to the employer's identity provider (the demo's
// "Acme Corp"). Authorization code + PKCE; tokens live in sessionStorage for this tab only. The API verifies
// the ID token; nothing here trusts its claims for anything but display.
import { create } from 'zustand';

export interface AuthConfig {
  domain: string;
  clientId: string;
  idp: string;
}

export interface Claims {
  sub: string;
  email?: string;
  groups: string[];
  persona?: string;
  exp: number;
}

const KEY = 'ting.auth';
const PKCE = 'ting.pkce';

export const authConfig = (): AuthConfig | undefined => (typeof window === 'undefined' ? undefined : window.TING_CONFIG?.auth);

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function decodeClaims(idToken: string): Claims {
  const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    groups: Array.isArray(payload['cognito:groups']) ? (payload['cognito:groups'] as string[]) : [],
    persona: typeof payload['ting:persona'] === 'string' && payload['ting:persona'] ? (payload['ting:persona'] as string) : undefined,
    exp: Number(payload.exp),
  };
}

interface Stored {
  idToken: string;
  refreshToken?: string;
}

function load(): Stored | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : undefined;
  } catch {
    return undefined;
  }
}

interface AuthState {
  claims?: Claims;
  idToken?: string;
  set: (s?: Stored) => void;
}

export const useAuth = create<AuthState>()((set) => {
  const s = typeof window === 'undefined' ? undefined : load();
  const claims = s ? decodeClaims(s.idToken) : undefined;
  const fresh = claims && claims.exp * 1000 > Date.now();
  return {
    claims: fresh ? claims : undefined,
    idToken: fresh ? s?.idToken : undefined,
    set: (stored) => {
      try {
        if (stored) sessionStorage.setItem(KEY, JSON.stringify(stored));
        else sessionStorage.removeItem(KEY);
      } catch {
        /* storage blocked: the session lasts until reload */
      }
      set({ idToken: stored?.idToken, claims: stored ? decodeClaims(stored.idToken) : undefined });
    },
  };
});

/** The ID token for API calls, while it's valid. */
export function currentIdToken(): string | undefined {
  const { idToken, claims } = useAuth.getState();
  return idToken && claims && claims.exp * 1000 > Date.now() + 30_000 ? idToken : undefined;
}

const redirectUri = () => `${window.location.origin}/auth/callback`;

/** `prompt: 'login'` forces a fresh sign-in (step-up before sharing); `returnTo` is where to land afterwards. */
export async function signIn(opts: { prompt?: 'login'; returnTo?: string } = {}): Promise<void> {
  const cfg = authConfig();
  if (!cfg) throw new Error('Sign-in is not configured');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state, returnTo: opts.returnTo }));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    identity_provider: cfg.idp,
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
  });
  window.location.assign(`${cfg.domain}/oauth2/authorize?${q}`);
}

export async function completeSignIn(code: string, state: string): Promise<Claims & { returnTo?: string }> {
  const cfg = authConfig();
  if (!cfg) throw new Error('Sign-in is not configured');
  const saved = JSON.parse(sessionStorage.getItem(PKCE) ?? '{}') as { verifier?: string; state?: string; returnTo?: string };
  sessionStorage.removeItem(PKCE);
  if (!saved.verifier || saved.state !== state) throw new Error('This sign-in link is stale. Start again.');
  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: cfg.clientId, code, redirect_uri: redirectUri(), code_verifier: saved.verifier }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  const tokens = (await res.json()) as { id_token: string; refresh_token?: string };
  useAuth.getState().set({ idToken: tokens.id_token, refreshToken: tokens.refresh_token });
  return { ...decodeClaims(tokens.id_token), returnTo: saved.returnTo?.startsWith('/') ? saved.returnTo : undefined };
}

export async function signOut(): Promise<void> {
  const cfg = authConfig();
  const stored = load();
  useAuth.getState().set(undefined);
  if (!cfg) return;
  if (stored?.refreshToken) {
    await fetch(`${cfg.domain}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: stored.refreshToken, client_id: cfg.clientId }),
    }).catch(() => undefined);
  }
  window.location.assign(`${cfg.domain}/logout?${new URLSearchParams({ client_id: cfg.clientId, logout_uri: `${window.location.origin}/` })}`);
}
