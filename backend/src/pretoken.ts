// Cognito pre-token-generation trigger (Ting user pool). The employer's identity provider passes employer and
// employee IDs; this maps them to the Lincoln member record and the user's role. The employer never sends, and
// Ting never returns to the employer, any dental data. A user who signed up with email + password has no employer
// attributes: they get their own member id (derived from their Cognito sub) and the sample group policy.
import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import { memberIdFor } from '../../src/data/members';
import { GROUP_POLICIES, memberFor } from './lib/identity';

export async function handler(event: PreTokenGenerationTriggerEvent) {
  const a = event.request.userAttributes;
  const selfSignUp = !a['custom:employer_id'];
  const m = selfSignUp
    ? { group: 'member', personaId: undefined, memberId: memberIdFor(a.sub), groupPolicy: GROUP_POLICIES.ACME }
    : memberFor(a['custom:employer_id'], a['custom:employee_id'], a['custom:role']);
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: { 'ting:persona': m.personaId ?? '', 'ting:member': m.memberId ?? '', 'ting:group_policy': m.groupPolicy ?? '' },
      groupOverrideDetails: { groupsToOverride: [m.group] },
    },
  };
  return event;
}
