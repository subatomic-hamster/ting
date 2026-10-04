// Specs that exercise the sample members open the app in sample mode (what "Explore a sample member" does);
// without it, a signed-out visitor is sent to sign-up. The sign-up journey uses plain @playwright/test.
import { test as base } from '@playwright/test';

export const test = base.extend({
  // `provide`, not `use`: the React hooks lint rule reads a call to `use` as a hook.
  context: async ({ context }, provide) => {
    await context.addInitScript(() => sessionStorage.setItem('ting.sample', '1'));
    await provide(context);
  },
});

export { expect, type Page } from '@playwright/test';
