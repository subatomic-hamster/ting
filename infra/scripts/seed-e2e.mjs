// End-to-end test users in the Ting member pool (admin-created, admin-API sign-in only). Passwords are random and
// written only to infra/e2e-users.local.json (gitignored). Usage (from infra/): node scripts/seed-e2e.mjs
import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

const { Ting: out } = JSON.parse(readFileSync(new URL('../outputs.json', import.meta.url), 'utf8'));
const cognito = new CognitoIdentityProviderClient({});
const USERS = [
  { email: 'e2e-dale@ting.test', employeeId: 'E1001', role: 'member' },
  { email: 'e2e-admin@ting.test', employeeId: 'E2001', role: 'employer_admin' },
  { email: 'e2e-analyst@ting.test', employeeId: 'L0001', role: 'lincoln_analyst' },
];
const saved = [];
for (const u of USERS) {
  const attrs = [
    { Name: 'email', Value: u.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:employer_id', Value: 'ACME' },
    { Name: 'custom:employee_id', Value: u.employeeId },
    { Name: 'custom:role', Value: u.role },
  ];
  try {
    await cognito.send(new AdminCreateUserCommand({ UserPoolId: out.MembersPoolId, Username: u.email, UserAttributes: attrs, MessageAction: 'SUPPRESS' }));
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    await cognito.send(new AdminUpdateUserAttributesCommand({ UserPoolId: out.MembersPoolId, Username: u.email, UserAttributes: attrs }));
  }
  const password = `${randomBytes(12).toString('base64url')}Aa1!`;
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: out.MembersPoolId, Username: u.email, Password: password, Permanent: true }));
  saved.push({ ...u, password });
}
const file = new URL('../e2e-users.local.json', import.meta.url);
writeFileSync(file, JSON.stringify({ note: 'E2E test accounts (test data only). Do not commit.', users: saved }, null, 2) + '\n');
chmodSync(file, 0o600);
console.log(`Seeded ${saved.length} e2e users`);
