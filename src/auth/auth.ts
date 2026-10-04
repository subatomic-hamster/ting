// Sign-in, three ways:
// - "password": members sign up with email + password in the Ting user pool (Cognito, called directly; no
//   hosted page). Tokens live in localStorage so a phone that scanned the QR code stays signed in.
// - "sso": employer single sign-on, Cognito hosted sign-in federated to the employer's identity provider (the
//   demo's "Acme Corp"). Authorization code + PKCE; tokens live in sessionStorage for this tab only.
// - "local": with no backend (mock mode, the offline Docker image), accounts live in this browser only.
// The API verifies ID tokens; nothing here trusts claims for anything but display and picking the member.
import { create } from 'zustand';
import { memberIdFor } from '../data/members';

export interface AuthConfig {
  domain: string;
  clientId: string;
  idp: string;
  region?: string;
  userPoolId?: string;
}

export interface Claims {
  sub: string;
  email?: string;
  groups: string[];
  persona?: string;
  exp: number;
}

export type AuthKind = 'sso' | 'password' | 'local';

const KEY = 'ting.auth';
const ACCOUNT = 'ting.account';
const LOCAL_ACCOUNTS = 'ting.localAccounts.v1';
const PKCE = 'ting.pkce';

export const authConfig = (): AuthConfig | undefined => (typeof window === 'undefined' ? undefined : window.TING_CONFIG?.auth);

const mockMode = () => (typeof window === 'undefined' ? true : window.TING_CONFIG?.useMocks) ?? import.meta.env.VITE_USE_MOCKS !== 'false';

/** Email + password accounts: the Cognito user pool when the stack configured it, otherwise local (mock mode only). */
export function passwordAuth(): 'cognito' | 'local' | undefined {
  const cfg = authConfig();
  if (cfg?.clientId && cognitoRegion(cfg)) return 'cognito';
  return mockMode() ? 'local' : undefined;
}

const cognitoRegion = (cfg: AuthConfig) => cfg.region ?? /\.auth\.([a-z0-9-]+)\.amazoncognito\.com/.exec(cfg.domain)?.[1];

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
  kind?: AuthKind;
  idToken?: string;
  refreshToken?: string;
  /** Local accounts carry their claims directly (there's no token). */
  local?: { sub: string; email: string };
}

function load(): Stored | undefined {
  try {
    const raw = localStorage.getItem(ACCOUNT) ?? sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : undefined;
  } catch {
    return undefined;
  }
}

const claimsOf = (s: Stored): Claims | undefined =>
  s.local ? { sub: s.local.sub, email: s.local.email, groups: ['member'], exp: Number.MAX_SAFE_INTEGER / 1000 } : s.idToken ? decodeClaims(s.idToken) : undefined;

interface AuthState {
  claims?: Claims;
  idToken?: string;
  kind?: AuthKind;
  set: (s?: Stored) => void;
}

export const useAuth = create<AuthState>()((set) => {
  const s = typeof window === 'undefined' ? undefined : load();
  const claims = s ? claimsOf(s) : undefined;
  // A password session with an expired ID token is refreshed on the first API call.
  const usable = claims && (claims.exp * 1000 > Date.now() || (s?.kind === 'password' && !!s.refreshToken));
  return {
    claims: usable ? claims : undefined,
    idToken: usable ? s?.idToken : undefined,
    kind: usable ? (s?.kind ?? 'sso') : undefined,
    set: (stored) => {
      try {
        localStorage.removeItem(ACCOUNT);
        sessionStorage.removeItem(KEY);
        if (stored) (stored.kind === 'sso' || !stored.kind ? sessionStorage : localStorage).setItem(stored.kind === 'sso' || !stored.kind ? KEY : ACCOUNT, JSON.stringify(stored));
      } catch {
        /* storage blocked: the session lasts until reload */
      }
      set({ idToken: stored?.idToken, claims: stored ? claimsOf(stored) : undefined, kind: stored ? (stored.kind ?? 'sso') : undefined });
    },
  };
});

/** The ID token for API calls, while it's valid. */
export function currentIdToken(): string | undefined {
  const { idToken, claims } = useAuth.getState();
  return idToken && claims && claims.exp * 1000 > Date.now() + 30_000 ? idToken : undefined;
}

/** The signed-up member this session acts for (password or local accounts; SSO users are mapped by the server). */
export function currentMemberId(): string | undefined {
  const { claims, kind } = useAuth.getState();
  return claims && (kind === 'password' || kind === 'local') ? memberIdFor(claims.sub) : undefined;
}

// --- email + password ------------------------------------------------------------------------------

export class AuthError extends Error {}

async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const cfg = authConfig();
  const region = cfg && cognitoRegion(cfg);
  if (!cfg || !region) throw new AuthError('Sign-in is not configured.');
  let res: Response;
  try {
    res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
      body: JSON.stringify({ ClientId: cfg.clientId, ...body }),
    });
  } catch {
    throw new AuthError("Couldn't reach the sign-in service. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return json as T;
  const type = String(json.__type ?? '').split('#').pop();
  const message = typeof json.message === 'string' ? json.message : '';
  throw new AuthError(
    type === 'UsernameExistsException'
      ? 'An account with this email already exists. Sign in instead.'
      : type === 'NotAuthorizedException' || type === 'UserNotFoundException'
        ? 'Incorrect email or password.'
        : type === 'InvalidPasswordException' || type === 'InvalidParameterException'
          ? message.replace(/^.*?: /, '') || 'Choose a password with at least 8 characters, a lowercase letter and a number.'
          : type === 'TooManyRequestsException' || type === 'LimitExceededException'
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Sign-in failed. Try again.',
  );
}

interface AuthResult {
  AuthenticationResult?: { IdToken: string; RefreshToken?: string };
}

async function cognitoSignIn(email: string, password: string) {
  const r = await cognito<AuthResult>('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } });
  if (!r.AuthenticationResult) throw new AuthError('Sign-in needs another step this app does not support.');
  useAuth.getState().set({ kind: 'password', idToken: r.AuthenticationResult.IdToken, refreshToken: r.AuthenticationResult.RefreshToken });
}

/** An ID token that's good for at least 30 more seconds, refreshing a password session when needed. */
export async function freshIdToken(): Promise<string | undefined> {
  const now = currentIdToken();
  if (now) return now;
  const s = load();
  if (s?.kind !== 'password' || !s.refreshToken) return undefined;
  try {
    const r = await cognito<AuthResult>('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: s.refreshToken } });
    if (!r.AuthenticationResult) return undefined;
    useAuth.getState().set({ kind: 'password', idToken: r.AuthenticationResult.IdToken, refreshToken: s.refreshToken });
    return r.AuthenticationResult.IdToken;
  } catch {
    useAuth.getState().set(undefined);
    return undefined;
  }
}

// Local accounts (no backend): stored in this browser only, password salted and hashed.
interface LocalAccount {
  sub: string;
  salt: string;
  hash: string;
}

const readLocal = (): Record<string, LocalAccount> => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS) ?? '{}') as Record<string, LocalAccount>;
  } catch {
    return {};
  }
};

async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) {
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256);
    return b64url(bits);
  }
  // ponytail: insecure origins (plain http on a LAN IP) have no WebCrypto; FNV-1a keeps a demo account usable there.
  let h = 0x811c9dc5;
  for (const ch of `${salt}:${password}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return `fnv-${(h >>> 0).toString(16)}`;
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0');

export function validateCredentials(email: string, password: string, signUp: boolean): string | undefined {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (!signUp) return password ? undefined : 'Enter your password.';
  if (password.length < 8 || !/[a-z]/.test(password) || !/\d/.test(password))
    return 'Choose a password with at least 8 characters, a lowercase letter and a number.';
  return undefined;
}

export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const invalid = validateCredentials(address, password, true);
  if (invalid) throw new AuthError(invalid);
  if (passwordAuth() === 'cognito') {
    await cognito('SignUp', { Username: address, Password: password, UserAttributes: [{ Name: 'email', Value: address }] });
    await cognitoSignIn(address, password);
    return;
  }
  const accounts = readLocal();
  if (accounts[address]) throw new AuthError('An account with this email already exists. Sign in instead.');
  const salt = randomId();
  const sub = randomId();
  accounts[address] = { sub, salt, hash: await hashPassword(password, salt) };
  try {
    localStorage.setItem(LOCAL_ACCOUNTS, JSON.stringify(accounts));
  } catch {
    throw new AuthError('This browser blocks saving accounts. Allow site data and try again.');
  }
  useAuth.getState().set({ kind: 'local', local: { sub, email: address } });
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const invalid = validateCredentials(address, password, false);
  if (invalid) throw new AuthError(invalid);
  if (passwordAuth() === 'cognito') return cognitoSignIn(address, password);
  const account = readLocal()[address];
  if (!account || (await hashPassword(password, account.salt)) !== account.hash) throw new AuthError('Incorrect email or password.');
  useAuth.getState().set({ kind: 'local', local: { sub: account.sub, email: address } });
}

// --- employer single sign-on -------------------------------------------------------------------------

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
  useAuth.getState().set({ kind: 'sso', idToken: tokens.id_token, refreshToken: tokens.refresh_token });
  return { ...decodeClaims(tokens.id_token), returnTo: saved.returnTo?.startsWith('/') ? saved.returnTo : undefined };
}

/** Password and local sessions just end here; an SSO session also signs out of the hosted page. */
export async function signOut(): Promise<void> {
  const cfg = authConfig();
  const stored = load();
  useAuth.getState().set(undefined);
  if (!cfg || stored?.kind === 'password' || stored?.kind === 'local') {
    if (stored?.kind === 'password' && stored.refreshToken)
      await cognito('RevokeToken', { Token: stored.refreshToken }).catch(() => undefined);
    return;
  }
  if (stored?.refreshToken) {
    await fetch(`${cfg.domain}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: stored.refreshToken, client_id: cfg.clientId }),
    }).catch(() => undefined);
  }
  window.location.assign(`${cfg.domain}/logout?${new URLSearchParams({ client_id: cfg.clientId, logout_uri: `${window.location.origin}/` })}`);
}
