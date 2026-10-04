// Winnow on a Mac that AWS can't reach directly: requests go on an SQS queue, a worker on the Mac
// (infra/scripts/winnow-worker.mjs) long-polls it over HTTPS, asks the local server and writes the answer to
// DynamoDB. A heartbeat item says whether the worker is alive; without it the caller falls back to the simulation.
import { randomUUID } from 'node:crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { fromWinnow, type Decide, type WinnowAnswers } from '../ai/winnow';
import { isRec } from '../ai/model';
import { db } from './db';

const TABLE = process.env.TABLE_NAME ?? '';
const sqs = new SQSClient({});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const HEARTBEAT_KEY = { pk: 'WINNOW', sk: 'HEARTBEAT' };
const FRESH_MS = 45_000;

let lastCheck = { at: 0, alive: false };
/** Whether the Mac worker checked in recently (cached for 10 s per Lambda instance). */
export async function workerAlive(): Promise<boolean> {
  if (Date.now() - lastCheck.at < 10_000) return lastCheck.alive;
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: HEARTBEAT_KEY }));
  const alive = typeof res.Item?.at === 'number' && Date.now() - res.Item.at < FRESH_MS;
  lastCheck = { at: Date.now(), alive };
  return alive;
}

export function queuedWinnow(queueUrl: string, temperature = 1, timeoutMs = 12_000): Decide {
  return async (state, questions) => {
    if (!(await workerAlive())) throw new Error('Winnow worker is offline');
    const id = randomUUID();
    // Same wire format as the live server (see liveWinnow): score criteria are the ordered labels.
    const wire = Object.fromEntries(
      Object.entries(questions).map(([name, q]) => [name, q.type === 'score' ? { type: 'score', instructions: q.instructions, criteria: q.scale } : q]),
    );
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ id, body: { model: 'Winnow-12B', state, questions: wire, winnow: { temperature } } }),
      }),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(150);
      const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `WINNOW#${id}`, sk: 'RESULT' } }));
      if (!res.Item) continue;
      if (res.Item.error) throw new Error(`Winnow worker: ${String(res.Item.error)}`);
      const results = isRec(res.Item.answers) ? res.Item.answers : {};
      const answers: WinnowAnswers = {};
      for (const [name, q] of Object.entries(questions)) {
        const dist = fromWinnow(results[name], q);
        if (dist) answers[name] = dist;
      }
      if (!Object.keys(answers).length) throw new Error('Winnow returned no usable answers');
      return { answers, source: 'winnow' };
    }
    throw new Error('Winnow worker timed out');
  };
}
