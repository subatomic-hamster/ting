// Cognito pre-token-generation trigger (Ting user pool). The employer's identity provider passes employer and
// employee IDs; this maps them to the Lincoln member record and the user's role. The employer never sends, and
// Ting never returns to the employer, any dental data.
import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import { memberFor } from './lib/identity';

export async function handler(event: PreTokenGenerationTriggerEvent) {
  const a = event.request.userAttributes;
  const m = memberFor(a['custom:employer_id'], a['custom:employee_id'], a['custom:role']);
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: { 'ting:persona': m.personaId ?? '', 'ting:member': m.memberId ?? '', 'ting:group_policy': m.groupPolicy ?? '' },
      groupOverrideDetails: { groupsToOverride: [m.group] },
    },
  };
  return event;
}
