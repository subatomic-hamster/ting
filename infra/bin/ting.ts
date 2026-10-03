import { App } from 'aws-cdk-lib';
import { TingStack } from '../lib/ting-stack';

const app = new App();
new TingStack(app, 'Ting', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2' },
  description: 'Ting dental decision engine: API, claims feed, documents and web app',
});
