// Seeds the mock "Acme Corp" workforce directory (the employer IdP pool) with demo employees.
// Passwords are random and written only to infra/acme-users.local.json (gitignored); nothing is printed.
// Usage (from infra/): AWS_PROFILE=ting-aws AWS_REGION=us-west-2 node scripts/seed-acme.mjs
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

const EMPLOYEES = [
  { email: 'dale@acme.example', employeeId: 'E1001', role: 'member', name: 'Dale (member)' },
  { email: 'jordan@acme.example', employeeId: 'E1002', role: 'member', name: 'Jordan (member)' },
  { email: 'priya@acme.example', employeeId: 'E1003', role: 'member', name: 'Priya (member)' },
  { email: 'benefits@acme.example', employeeId: 'E2001', role: 'employer_admin', name: 'Acme benefits admin' },
  { email: 'analyst@lincoln.example', employeeId: 'L0001', role: 'lincoln_analyst', name: 'Plan analyst' },
];

// Meets Cognito's default policy: upper, lower, digit, symbol, 8+.
const password = () => `${randomBytes(9).toString('base64url')}Aa1!`;

const saved = [];
for (const e of EMPLOYEES) {
  const attrs = [
    { Name: 'email', Value: e.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:employer_id', Value: 'ACME' },
    { Name: 'custom:employee_id', Value: e.employeeId },
    { Name: 'custom:role', Value: e.role },
  ];
  try {
    await cognito.send(new AdminCreateUserCommand({ UserPoolId: out.AcmePoolId, Username: e.email, UserAttributes: attrs, MessageAction: 'SUPPRESS' }));
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    await cognito.send(new AdminUpdateUserAttributesCommand({ UserPoolId: out.AcmePoolId, Username: e.email, UserAttributes: attrs }));
  }
  const pw = password();
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: out.AcmePoolId, Username: e.email, Password: pw, Permanent: true }));
  saved.push({ ...e, password: pw });
}

const file = new URL('../acme-users.local.json', import.meta.url);
writeFileSync(file, JSON.stringify({ note: 'Demo Acme SSO accounts (test data only). Do not commit.', users: saved }, null, 2) + '\n');
chmodSync(file, 0o600);
console.log(`Seeded ${saved.length} Acme accounts; credentials in infra/acme-users.local.json`);
