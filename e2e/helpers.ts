import { readFileSync } from 'node:fs';
import { AdminInitiateAuthCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { Page } from '@playwright/test';

export const outputs = JSON.parse(readFileSync(new URL('../infra/outputs.json', import.meta.url), 'utf8')).Ting as Record<string, string>;
export const API = outputs.ApiUrl.replace(/\/$/, '');

export type Role = 'member' | 'employer_admin' | 'lincoln_analyst';
const users = () => JSON.parse(readFileSync(new URL('../infra/e2e-users.local.json', import.meta.url), 'utf8')).users as { email: string; role: Role; password: string }[];

const tokens = new Map<Role, string>();
/** A real Cognito ID token for a seeded test user, through the admin API (never a web sign-in form). */
export async function idToken(role: Role): Promise<string> {
  const cached = tokens.get(role);
  if (cached) return cached;
  const u = users().find((x) => x.role === role);
  if (!u) throw new Error(`no e2e user for ${role}; run infra/scripts/seed-e2e.mjs`);
  const res = await new CognitoIdentityProviderClient({ region: 'us-west-2' }).send(
    new AdminInitiateAuthCommand({
      UserPoolId: outputs.MembersPoolId,
      ClientId: outputs.E2EClientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: u.email, PASSWORD: u.password },
    }),
  );
  const token = res.AuthenticationResult?.IdToken;
  if (!token) throw new Error('no token');
  tokens.set(role, token);
  return token;
}

/** Starts the page signed in as `role`, the way the app stores a session after the hosted sign-in. */
export async function signInAs(page: Page, role: Role) {
  const token = await idToken(role);
  await page.addInitScript((t) => sessionStorage.setItem('ting.auth', JSON.stringify({ idToken: t })), token);
}

export async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return fetch(`${API}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers },
  });
}

/** Clears a persona's claims on the server so every run starts from the same ledger. */
export const resetDemo = (persona = 'dale') => api(`/demo/reset?persona=${persona}`, { method: 'POST', body: '{}' });

/** Fails the test on uncaught page errors. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => errors;
}
