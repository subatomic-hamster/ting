import * as fs from 'node:fs';
import * as path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { EventBus, Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import {
  CfnUserPoolGroup,
  ClientAttributes,
  OAuthScope,
  OidcAttributeRequestMethod,
  ProviderAttribute,
  StringAttribute,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolIdentityProviderOidc,
} from 'aws-cdk-lib/aws-cognito';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Construct } from 'constructs';

const ROOT = path.join(__dirname, '..', '..');

/** Automated Reasoning guardrail from scripts/ar-policy.mjs, when it has been built. */
const arFile = path.join(__dirname, '..', 'ar.json');
const ar: { guardrailId: string; guardrailVersion: string } | undefined = fs.existsSync(arFile) ? JSON.parse(fs.readFileSync(arFile, 'utf8')) : undefined;

/** Temperature fitted by infra/calibrate.mjs on the labelled dental set. */
const calFile = path.join(__dirname, '..', '..', 'public', 'calibration.json');
const winnowTemperature = fs.existsSync(calFile) ? String(JSON.parse(fs.readFileSync(calFile, 'utf8')).temperature ?? 1) : '1';

/** Bedrock inference profiles. The event's private Marketplace allows Haiku 4.5 and Sonnet 5 (not Sonnet 5.5). */
const MODEL_FAST = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const MODEL_SMART = 'us.anthropic.claude-sonnet-5';

export class TingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Event-account resources are disposable: everything is deleted with the stack.
    const table = new Table(this, 'Data', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Pending reminders by send date: gsi1pk = REMINDER#PENDING, gsi1sk = <sendOn>#<member>#<id>.
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
    });

    // Optional: `cdk deploy -c reminderEmail=you@example.com` verifies that address in SES and sends reminder
    // emails to it (SES sandbox: sender and recipient must be verified). Without it, reminders are in-app only.
    const reminderEmail: string = this.node.tryGetContext('reminderEmail') ?? '';
    if (reminderEmail) new EmailIdentity(this, 'ReminderSender', { identity: Identity.email(reminderEmail) });

    const docs = new Bucket(this, 'Documents', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{ prefix: 'uploads/', expiration: Duration.days(7) }],
      // Browsers PUT straight to S3 with a presigned URL.
      cors: [{ allowedMethods: [HttpMethods.PUT], allowedOrigins: ['*'], allowedHeaders: ['*'], maxAge: 3000 }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const bus = new EventBus(this, 'Claims', { eventBusName: 'ting-claims' });

    // Lincoln's system of record (enrollment, plans, accumulators, claims, providers) as its own table. Its change
    // stream is how a visit adjudicated at the carrier reaches Ting with no one in the loop.
    const carrier = new Table(this, 'Carrier', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // AgentMail key, inbox and webhook secret: filled by the team (scripts/agentmail-setup.mjs), never in code.
    const agentMailSecret = new Secret(this, 'AgentMail', { description: 'AgentMail API key, inbox and webhook secret for Ting' });

    // Winnow requests for a worker on a machine AWS can't reach (the team's 24 GB Mac): it long-polls this queue
    // and writes answers to the table. Short retention: a request nobody answers in time is useless.
    const winnowQueue = new Queue(this, 'WinnowRequests', { retentionPeriod: Duration.minutes(5), visibilityTimeout: Duration.seconds(30) });
    // Direct server instead (a GPU host AWS can reach): `cdk deploy -c winnowUrl=https://… -c winnowKey=…`.
    const winnowEnv = {
      WINNOW_URL: this.node.tryGetContext('winnowUrl') ?? '',
      WINNOW_API_KEY: this.node.tryGetContext('winnowKey') ?? '',
      WINNOW_QUEUE_URL: winnowQueue.queueUrl,
    };

    const fn = (name: string, entry: string, extra: Partial<NodejsFunctionProps> = {}) =>
      new NodejsFunction(this, name, {
        entry: path.join(ROOT, 'backend', 'src', entry),
        projectRoot: ROOT,
        depsLockFilePath: path.join(ROOT, 'package-lock.json'),
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(10),
        logRetention: RetentionDays.ONE_WEEK,
        bundling: { minify: true, sourceMap: true, target: 'node22', externalModules: [] },
        environment: { TABLE_NAME: table.tableName, NODE_OPTIONS: '--enable-source-maps' },
        ...extra,
      });

    // --- WebSocket: live claims to open dashboards ----------------------------------------------------------
    const wsFn = fn('WsFn', 'ws.ts');
    const wsApi = new WebSocketApi(this, 'Live', {
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('Connect', wsFn) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('Disconnect', wsFn) },
      routeSelectionExpression: '$request.body.action',
    });
    wsApi.addRoute('replay', { integration: new WebSocketLambdaIntegration('Replay', wsFn) });
    const wsStage = new WebSocketStage(this, 'LiveStage', { webSocketApi: wsApi, stageName: 'prod', autoDeploy: true });
    table.grantReadWriteData(wsFn);
    wsApi.grantManageConnections(wsFn);

    // --- Claims feed: EventBridge → ledger → sockets ----------------------------------------------------------
    const claimsFn = fn('ClaimsFn', 'claims.ts', {
      environment: { TABLE_NAME: table.tableName, WS_ENDPOINT: wsStage.callbackUrl, NODE_OPTIONS: '--enable-source-maps' },
    });
    table.grantReadWriteData(claimsFn);
    wsApi.grantManageConnections(claimsFn);
    new Rule(this, 'ClaimAdjudicated', {
      eventBus: bus,
      eventPattern: { source: ['ting.mock-lincoln', 'lincoln.claims'], detailType: ['claim.adjudicated'] },
      targets: [new LambdaFunction(claimsFn, { retryAttempts: 2 })],
    });

    // --- Web app: private bucket behind CloudFront, single-page-app routing ----------------------------------
    const site = new Bucket(this, 'Site', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        // App routes (including /share/<persona>.<kind>.<token>, which contains dots) get index.html; real files pass.
        "function handler(event) { var r = event.request; if (!/\\.(js|css|html|json|png|jpe?g|gif|svg|ico|txt|pdf|map|woff2?|webmanifest)$/i.test(r.uri)) { r.uri = '/index.html'; } return r; }",
      ),
    });
    const distribution = new cloudfront.Distribution(this, 'Web', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    const webOrigin = `https://${distribution.distributionDomainName}`;

    // --- Sign-in: Ting's member pool, federated over OIDC to a mock "Acme Corp" employer IdP (a second pool) -----
    const employeeAttrs = {
      employer_id: new StringAttribute({ mutable: true }),
      employee_id: new StringAttribute({ mutable: true }),
      role: new StringAttribute({ mutable: true }),
    };
    const acme = new UserPool(this, 'AcmeIdp', {
      userPoolName: 'acme-corp-workforce',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      customAttributes: employeeAttrs,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    acme.addDomain('AcmeDomain', { cognitoDomain: { domainPrefix: `acme-sso-${this.account}` } });

    const preTokenFn = fn('PreTokenFn', 'pretoken.ts');
    const members = new UserPool(this, 'Members', {
      userPoolName: 'ting-members',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      customAttributes: employeeAttrs,
      lambdaTriggers: { preTokenGeneration: preTokenFn },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const membersDomain = members.addDomain('MembersDomain', { cognitoDomain: { domainPrefix: `ting-${this.account}` } });
    for (const group of ['member', 'employer_admin', 'lincoln_analyst'])
      new CfnUserPoolGroup(this, `Group-${group}`, { userPoolId: members.userPoolId, groupName: group });

    const employeeRead = new ClientAttributes().withStandardAttributes({ email: true }).withCustomAttributes('employer_id', 'employee_id', 'role');
    const acmeClient = acme.addClient('TingFederation', {
      generateSecret: true,
      readAttributes: employeeRead,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [`${membersDomain.baseUrl()}/oauth2/idpresponse`],
      },
    });
    const acmeIdp = new UserPoolIdentityProviderOidc(this, 'AcmeOidc', {
      userPool: members,
      name: 'AcmeCorp',
      clientId: acmeClient.userPoolClientId,
      clientSecret: acmeClient.userPoolClientSecret.unsafeUnwrap(),
      issuerUrl: `https://cognito-idp.${this.region}.amazonaws.com/${acme.userPoolId}`,
      scopes: ['openid', 'email', 'profile'],
      attributeRequestMethod: OidcAttributeRequestMethod.GET,
      attributeMapping: {
        email: ProviderAttribute.other('email'),
        custom: {
          'custom:employer_id': ProviderAttribute.other('custom:employer_id'),
          'custom:employee_id': ProviderAttribute.other('custom:employee_id'),
          'custom:role': ProviderAttribute.other('custom:role'),
        },
      },
    });
    const webClient = members.addClient('Web', {
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.custom('AcmeCorp')],
      readAttributes: employeeRead,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [`${webOrigin}/auth/callback`, 'http://localhost:5173/auth/callback'],
        logoutUrls: [`${webOrigin}/`, 'http://localhost:5173/'],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });
    webClient.node.addDependency(acmeIdp);
    // End-to-end tests only: admin-created test users in the member pool sign in through the AWS admin API
    // (IAM credentials required), never through a web page. The pre-token trigger maps them like federated users.
    const e2eClient = members.addClient('E2E', {
      generateSecret: false,
      authFlows: { adminUserPassword: true },
      readAttributes: employeeRead,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(1),
    });

    // --- HTTP API: the TingApi routes ---------------------------------------------------------------------------
    const apiFn = fn('ApiFn', 'api.ts', {
      memorySize: 1024,
      timeout: Duration.seconds(29),
      environment: {
        TABLE_NAME: table.tableName,
        DOCS_BUCKET: docs.bucketName,
        EVENT_BUS: bus.eventBusName,
        WEB_ORIGIN: webOrigin,
        WS_ENDPOINT: wsStage.callbackUrl,
        REMINDER_EMAIL: reminderEmail,
        // Set with `cdk deploy -c winnowUrl=http://<gpu-host>:8080` once the Winnow server runs; empty = simulated.
        ...winnowEnv,
        WINNOW_TEMPERATURE: winnowTemperature,
        AR_GUARDRAIL_ID: ar?.guardrailId ?? '',
        AR_GUARDRAIL_VERSION: ar?.guardrailVersion ?? '',
        AR_RULES_PREFIX: 'PLAN-ACME-LOW',
        USER_POOL_ID: members.userPoolId,
        USER_POOL_CLIENT_ID: webClient.userPoolClientId,
        E2E_CLIENT_ID: e2eClient.userPoolClientId,
        MODEL_FAST,
        MODEL_SMART,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    table.grantReadWriteData(apiFn);
    docs.grantReadWrite(apiFn); // presigned PUTs are signed as this role; Textract reads with its credentials
    bus.grantPutEventsTo(apiFn);
    winnowQueue.grantSendMessages(apiFn);
    wsApi.grantManageConnections(apiFn); // the demo reminder run pushes to sockets

    // Year-end reminders: a daily rule (EventBridge Scheduler isn't available in event accounts) sends the due ones.
    const remindersFn = fn('RemindersFn', 'reminders.ts', {
      timeout: Duration.seconds(60),
      environment: { TABLE_NAME: table.tableName, WS_ENDPOINT: wsStage.callbackUrl, WEB_ORIGIN: webOrigin, REMINDER_EMAIL: reminderEmail, MODEL_FAST, ...winnowEnv },
    });
    table.grantReadWriteData(remindersFn);
    wsApi.grantManageConnections(remindersFn);
    const sesSend = new PolicyStatement({ actions: ['ses:SendEmail'], resources: ['*'] });
    remindersFn.addToRolePolicy(sesSend);
    winnowQueue.grantSendMessages(remindersFn);
    // Digests are reworded by the fast model (amounts checked), same as the API's explanations.
    remindersFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel', 'aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_FAST}`, 'arn:aws:bedrock:*::foundation-model/anthropic.*', '*'],
      }),
    );
    apiFn.addToRolePolicy(sesSend);
    new Rule(this, 'DailyReminders', {
      schedule: Schedule.cron({ minute: '0', hour: '13' }), // 9am Eastern
      targets: [new LambdaFunction(remindersFn)],
    });
    apiFn.addToRolePolicy(new PolicyStatement({ actions: ['textract:DetectDocumentText'], resources: ['*'] }));
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_FAST}`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_SMART}`,
          'arn:aws:bedrock:*::foundation-model/anthropic.*',
        ],
      }),
    );
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:ApplyGuardrail', 'bedrock:InvokeAutomatedReasoningPolicy'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:guardrail/*`,
          `arn:aws:bedrock:*:${this.account}:guardrail-profile/*`,
          'arn:aws:bedrock:*::guardrail-profile/*',
          `arn:aws:bedrock:${this.region}:${this.account}:automated-reasoning-policy/*`,
        ],
      }),
    );
    // Anthropic models on Bedrock check the caller's Marketplace subscription on each call.
    apiFn.addToRolePolicy(new PolicyStatement({ actions: ['aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'], resources: ['*'] }));

    // --- Email agent, carrier sync, monthly overview ---------------------------------------------------------------
    const emailEnv = {
      TABLE_NAME: table.tableName,
      CARRIER_TABLE: carrier.tableName,
      AGENTMAIL_SECRET_ARN: agentMailSecret.secretArn,
      WS_ENDPOINT: wsStage.callbackUrl,
      WEB_ORIGIN: webOrigin,
      EVENT_BUS: bus.eventBusName,
      DOCS_BUCKET: docs.bucketName,
      MODEL_FAST,
      MODEL_SMART,
      ...winnowEnv,
      WINNOW_TEMPERATURE: winnowTemperature,
      NODE_OPTIONS: '--enable-source-maps',
    };
    const bedrockInvoke = new PolicyStatement({
      actions: ['bedrock:InvokeModel', 'aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_FAST}`,
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_SMART}`,
        'arn:aws:bedrock:*::foundation-model/anthropic.*',
        '*',
      ],
    });
    const emailAgentFn = fn('EmailAgentFn', 'emailAgent.ts', { memorySize: 1024, timeout: Duration.seconds(120), environment: emailEnv });
    const carrierSyncFn = fn('CarrierSyncFn', 'carrierSync.ts', { timeout: Duration.seconds(60), environment: emailEnv });
    const monthlyFn = fn('MonthlyFn', 'monthly.ts', { timeout: Duration.minutes(5), environment: emailEnv });
    for (const f of [emailAgentFn, carrierSyncFn, monthlyFn]) {
      table.grantReadWriteData(f);
      carrier.grantReadData(f);
      agentMailSecret.grantRead(f);
      wsApi.grantManageConnections(f);
      bus.grantPutEventsTo(f);
      winnowQueue.grantSendMessages(f);
      f.addToRolePolicy(bedrockInvoke);
    }
    docs.grantReadWrite(emailAgentFn);
    emailAgentFn.addToRolePolicy(new PolicyStatement({ actions: ['textract:DetectDocumentText'], resources: ['*'] }));
    carrierSyncFn.addEventSource(new DynamoEventSource(carrier, { startingPosition: StartingPosition.LATEST, batchSize: 10, retryAttempts: 2 }));
    // The API takes webhooks and demo emails and hands them to the agent.
    carrier.grantReadWriteData(apiFn);
    agentMailSecret.grantRead(apiFn);
    emailAgentFn.grantInvoke(apiFn);
    apiFn.addEnvironment('CARRIER_TABLE', carrier.tableName);
    apiFn.addEnvironment('AGENTMAIL_SECRET_ARN', agentMailSecret.secretArn);
    apiFn.addEnvironment('EMAIL_AGENT_FN', emailAgentFn.functionName);
    new Rule(this, 'MonthlyOverview', {
      schedule: Schedule.cron({ minute: '0', hour: '13', day: '1' }), // 9am Eastern on the 1st
      targets: [new LambdaFunction(monthlyFn)],
    });

    // --- Document ingestion: one Express workflow for every document (read → screen → record) ----------------
    const ingestFn = fn('IngestFn', 'ingest.ts', {
      memorySize: 1024,
      timeout: Duration.seconds(25),
      environment: {
        TABLE_NAME: table.tableName,
        MODEL_FAST,
        ...winnowEnv,
        WINNOW_TEMPERATURE: winnowTemperature,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    docs.grantRead(ingestFn);
    table.grantReadData(ingestFn); // the Winnow worker's heartbeat and answers
    winnowQueue.grantSendMessages(ingestFn);
    ingestFn.addToRolePolicy(new PolicyStatement({ actions: ['textract:DetectDocumentText'], resources: ['*'] }));
    ingestFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel', 'aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_FAST}`, 'arn:aws:bedrock:*::foundation-model/anthropic.*', '*'],
      }),
    );
    const read = new tasks.LambdaInvoke(this, 'Read', {
      lambdaFunction: ingestFn,
      payload: sfn.TaskInput.fromObject({ step: 'read', 'bucket.$': '$.bucket', 'key.$': '$.key', 'contentType.$': '$.contentType' }),
      payloadResponseOnly: true,
      resultPath: '$.read',
    });
    const screen = new tasks.LambdaInvoke(this, 'Screen', {
      lambdaFunction: ingestFn,
      payload: sfn.TaskInput.fromObject({
        step: 'screen',
        'key.$': '$.key',
        'contentType.$': '$.contentType',
        'text.$': '$.read.text',
        'hash.$': '$.read.hash',
      }),
      payloadResponseOnly: true,
      resultPath: '$.doc',
    });
    const record = new tasks.DynamoPutItem(this, 'Record', {
      table,
      item: {
        pk: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.format('MEMBER#{}', sfn.JsonPath.stringAt('$.member'))),
        sk: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.format('DOC#{}', sfn.JsonPath.stringAt('$.read.hash'))),
        kind: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.doc.kind')),
        key: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
      },
      conditionExpression: 'attribute_not_exists(pk)',
      resultPath: sfn.JsonPath.DISCARD,
    });
    const fresh = new sfn.Pass(this, 'New', { parameters: { 'doc.$': '$.doc', duplicate: false }, outputPath: '$' });
    const seen = new sfn.Pass(this, 'Duplicate', { parameters: { 'doc.$': '$.doc', duplicate: true } });
    record.addCatch(seen, { errors: ['DynamoDB.ConditionalCheckFailedException'], resultPath: '$.error' });
    const unreadable = new sfn.Pass(this, 'Unreadable', { parameters: { error: 'unreadable', 'cause.$': '$.error.Cause' } });
    read.addCatch(unreadable, { resultPath: '$.error' });
    const ingest = new sfn.StateMachine(this, 'Ingest', {
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(read.next(screen).next(record).next(fresh)),
      timeout: Duration.seconds(30),
      tracingEnabled: true,
    });
    ingest.grantStartSyncExecution(apiFn);
    apiFn.addEnvironment('INGEST_ARN', ingest.stateMachineArn);

    const httpApi = new HttpApi(this, 'Api', {
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', apiFn),
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization'],
        maxAge: Duration.hours(1),
      },
    });
    const apiUrl = httpApi.apiEndpoint;

    // The app reads its API and socket URLs from config.js at load time, so one build serves every stage.
    new BucketDeployment(this, 'DeployWeb', {
      sources: [
        Source.asset(path.join(ROOT, 'dist'), { exclude: ['config.js'] }),
        Source.data(
          'config.js',
          `window.TING_CONFIG = {"useMocks":false,"apiUrl":"${apiUrl}","wsUrl":"${wsStage.url}",` +
            `"auth":{"domain":"${membersDomain.baseUrl()}","clientId":"${webClient.userPoolClientId}","idp":"AcmeCorp"}};\n`,
        ),
      ],
      destinationBucket: site,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
    });

    new CfnOutput(this, 'WebUrl', { value: webOrigin });
    new CfnOutput(this, 'ApiUrl', { value: apiUrl });
    new CfnOutput(this, 'WsUrl', { value: wsStage.url });
    new CfnOutput(this, 'DocsBucket', { value: docs.bucketName });
    new CfnOutput(this, 'AcmePoolId', { value: acme.userPoolId });
    new CfnOutput(this, 'WinnowQueueUrl', { value: winnowQueue.queueUrl });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'CarrierTable', { value: carrier.tableName });
    new CfnOutput(this, 'AgentMailSecretArn', { value: agentMailSecret.secretArn });
    new CfnOutput(this, 'MembersPoolId', { value: members.userPoolId });
    new CfnOutput(this, 'SignInDomain', { value: membersDomain.baseUrl() });
    new CfnOutput(this, 'WebClientId', { value: webClient.userPoolClientId });
    new CfnOutput(this, 'E2EClientId', { value: e2eClient.userPoolClientId });
  }
}
