// Cognito pre-sign-up trigger (Ting member pool): a visitor who signs up with email + password is confirmed at once.
// No verification email is sent (SES is in the sandbox and could only mail verified addresses), so the address is
// marked verified too. Federated Acme sign-ins (PreSignUp_ExternalProvider) are already confirmed by their identity
// provider and are left as they are.
import type { PreSignUpTriggerEvent } from 'aws-lambda';

/** These decide a user's group and member; only the employer's identity provider may set them. */
const EMPLOYER_ATTRIBUTES = ['custom:employer_id', 'custom:employee_id', 'custom:role'];

export async function handler(event: PreSignUpTriggerEvent) {
  if (event.triggerSource === 'PreSignUp_SignUp') {
    // The app client cannot write these (see the stack); refuse them here as well.
    if (EMPLOYER_ATTRIBUTES.some((a) => event.request.userAttributes[a])) throw new Error('Sign-up cannot set employer attributes');
    event.response.autoConfirmUser = true;
    if (event.request.userAttributes.email) event.response.autoVerifyEmail = true;
  }
  return event;
}
