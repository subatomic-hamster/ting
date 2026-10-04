// Mac-side Winnow worker: long-polls the stack's SQS queue over HTTPS, asks the local Winnow server, and writes each
// answer to DynamoDB for the waiting Lambda. Nothing on this Mac is reachable from the internet.
// Usage (from infra/): AWS_PROFILE=ting-aws AWS_REGION=us-west-2 node scripts/winnow-worker.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const { Ting: out } = JSON.parse(readFileSync(new URL('../outputs.json', import.meta.url), 'utf8'));
const LOCAL = process.env.WINNOW_LOCAL ?? 'http://127.0.0.1:8091';
const KEY = readFileSync(`${homedir()}/Developer/winnow/api-key`, 'utf8').trim();
const sqs = new SQSClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ttl = () => Math.floor(Date.now() / 1000) + 600;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function heartbeat() {
  try {
    await db.send(new PutCommand({ TableName: out.TableName, Item: { pk: 'WINNOW', sk: 'HEARTBEAT', at: Date.now(), host: 'mac', ttl: ttl() } }));
  } catch (err) {
    log('heartbeat failed:', err.name, err.message); // expired credentials show up here first
  }
}

async function handle(msg) {
  const { id, body } = JSON.parse(msg.Body);
  const t0 = Date.now();
  let item;
  try {
    const res = await fetch(`${LOCAL}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    item = res.ok ? { answers: data.answers } : { error: `Winnow ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  } catch (err) {
    item = { error: `local Winnow unreachable: ${err.message}` };
  }
  await db.send(new PutCommand({ TableName: out.TableName, Item: { pk: `WINNOW#${id}`, sk: 'RESULT', ...item, ms: Date.now() - t0, ttl: ttl() } }));
  await sqs.send(new DeleteMessageCommand({ QueueUrl: out.WinnowQueueUrl, ReceiptHandle: msg.ReceiptHandle }));
  log(item.error ? `error ${item.error}` : `answered ${Object.keys(body.questions).length} question(s) in ${Date.now() - t0} ms`);
}

await heartbeat();
setInterval(heartbeat, 15_000);
log('Winnow worker polling', out.WinnowQueueUrl);
for (;;) {
  try {
    const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: out.WinnowQueueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 5 }));
    // Winnow serves one decision request at a time; answer in order.
    for (const msg of res.Messages ?? []) await handle(msg);
  } catch (err) {
    log('poll failed:', err.name, err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
