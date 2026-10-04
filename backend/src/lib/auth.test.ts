import { describe, expect, it } from 'vitest';
import { memberIdFor } from '../../../src/data/members';
import { handler as preSignUp } from '../presignup';
import { handler as preToken } from '../pretoken';
import { callerFromClaims } from './auth';

const sub = '3f9a1c2e-77b0-4d1e-9c3a-0e5b6f7a8b9c';

describe('callerFromClaims', () => {
  it('a password member gets a member id derived from their sub', () =>
    expect(callerFromClaims({ sub, 'ting:persona': '', 'cognito:groups': ['member'], email: 'a@b.co' })).toMatchObject({ memberId: 'U-3F9A1C2E77', email: 'a@b.co', personaId: undefined }));
  it('uses the ting:member claim when it is well formed, otherwise the sub', () => {
    expect(callerFromClaims({ sub, 'ting:member': 'U-0123456789' }).memberId).toBe('U-0123456789');
    expect(callerFromClaims({ sub, 'ting:member': 'M-10456' }).memberId).toBe(memberIdFor(sub));
  });
  it('an Acme SSO persona keeps its persona and gets no member id', () =>
    expect(callerFromClaims({ sub, 'ting:persona': 'dale', 'ting:member': 'M-10456' })).toMatchObject({ personaId: 'dale', memberId: undefined }));
  it('admins and analysts never get a member', () => {
    expect(callerFromClaims({ sub, 'cognito:groups': ['employer_admin'] }).memberId).toBeUndefined();
    expect(callerFromClaims({ sub, 'cognito:groups': ['lincoln_analyst'] }).memberId).toBeUndefined();
  });
});

const tokenEvent = (userAttributes: Record<string, string>) => ({ request: { userAttributes }, response: {} }) as Parameters<typeof preToken>[0];

describe('pre-token trigger', () => {
  it('self sign-up (no employer): own member id, sample group policy, member group', async () => {
    const out = await preToken(tokenEvent({ sub, email: 'a@b.co' }));
    expect(out.response.claimsOverrideDetails).toMatchObject({
      claimsToAddOrOverride: { 'ting:persona': '', 'ting:member': 'U-3F9A1C2E77', 'ting:group_policy': '00412345' },
      groupOverrideDetails: { groupsToOverride: ['member'] },
    });
  });
  it('Acme SSO users still map to their persona', async () => {
    const out = await preToken(tokenEvent({ sub, 'custom:employer_id': 'ACME', 'custom:employee_id': 'E1001', 'custom:role': 'member' }));
    expect(out.response.claimsOverrideDetails?.claimsToAddOrOverride).toMatchObject({ 'ting:persona': 'dale', 'ting:member': 'M-10456' });
  });
  it('an admin gets no member', async () => {
    const out = await preToken(tokenEvent({ sub, 'custom:employer_id': 'ACME', 'custom:employee_id': 'E2001', 'custom:role': 'employer_admin' }));
    expect(out.response.claimsOverrideDetails).toMatchObject({ claimsToAddOrOverride: { 'ting:member': '' }, groupOverrideDetails: { groupsToOverride: ['employer_admin'] } });
  });
});

const signUp = (triggerSource: string, userAttributes: Record<string, string>) => ({ triggerSource, request: { userAttributes }, response: {} }) as Parameters<typeof preSignUp>[0];

describe('pre-sign-up trigger', () => {
  it('confirms a password sign-up and verifies the email', async () => {
    const out = await preSignUp(signUp('PreSignUp_SignUp', { email: 'a@b.co' }));
    expect(out.response).toMatchObject({ autoConfirmUser: true, autoVerifyEmail: true });
  });
  it('leaves federated sign-ins alone', async () => {
    expect((await preSignUp(signUp('PreSignUp_ExternalProvider', { email: 'a@b.co' }))).response).toEqual({});
  });
  it('refuses a sign-up that tries to set an employer role', async () => {
    await expect(preSignUp(signUp('PreSignUp_SignUp', { email: 'a@b.co', 'custom:role': 'lincoln_analyst' }))).rejects.toThrow();
  });
});
