// Year-end reminders (src/engine/reminders.ts builds them in the app). Stored per member; a daily EventBridge rule
// sends the due ones. Email is content-free by design: amounts and procedures stay inside the app.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { shouldPush } from '../../../src/engine/decisions';
import { rankAlerts } from '../ai/winnowUses';
import type { Decide } from '../ai/winnow';
import { z } from 'zod';
import { db } from './db';
import { logWarn } from './log';
import { pushToMember } from './push';

const TABLE = process.env.TABLE_NAME ?? '';
const REMINDER_EMAIL = process.env.REMINDER_EMAIL ?? '';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '';
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';
const PENDING = 'REMINDER#PENDING';
const ses = new SESv2Client({});

export const reminderSchema = z.object({
  id: z.string().regex(/^\d{4}-(nov1|dec1|fsa)$/),
  kind: z.enum(['nov1', 'dec1', 'fsa']),
  sendOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(600),
  maxRemaining: z.number().nonnegative(),
  unusedCleanings: z.number().int().nonnegative(),
  fsaExpiring: z.number().nonnegative(),
  fsaDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type StoredReminder = z.infer<typeof reminderSchema>;

export const channels = (): ('in_app' | 'email')[] => (REMINDER_EMAIL ? ['in_app', 'email'] : ['in_app']);

const epochOf = (iso: string, plusDays: number) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000) + plusDays * 86_400;

/** Scheduling the same reminder id again replaces it (and makes it pending again). */
export async function scheduleReminder(member: string, reminder: StoredReminder) {
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `MEMBER#${member}`,
        sk: `REMINDER#${reminder.id}`,
        gsi1pk: PENDING,
        gsi1sk: `${reminder.sendOn}#${member}#${reminder.id}`,
        member,
        reminder,
        ttl: epochOf(reminder.sendOn, 60),
      },
    }),
  );
  return { reminderId: reminder.id, sendOn: reminder.sendOn, channels: channels() };
}

export async function cancelReminder(member: string, reminderId: string) {
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: `REMINDER#${reminderId}` } }));
}

async function sendEmail(): Promise<boolean> {
  if (!REMINDER_EMAIL) return false;
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: REMINDER_EMAIL,
      Destination: { ToAddresses: [REMINDER_EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: 'You have a dental benefits update' },
          Body: {
            Text: {
              Data: `You have a dental benefits update in Ting.\n\nSign in to see it: ${WEB_ORIGIN}\n\nFor your privacy, details stay inside the app.`,
            },
          },
        },
      },
    }),
  );
  return true;
}

/** ISO week key for the push cap. */
function weekKey(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return `${d.getUTCFullYear()}-W${String(1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

async function pushesThisWeek(member: string, asOf: string) {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: `PUSHES#${weekKey(asOf)}` } }));
  return Number(res.Item?.n ?? 0);
}

async function countPush(member: string, asOf: string) {
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `MEMBER#${member}`, sk: `PUSHES#${weekKey(asOf)}` },
      UpdateExpression: 'ADD n :one SET #t = :ttl',
      ExpressionAttributeNames: { '#t': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': Math.floor(Date.now() / 1000) + 14 * 86_400 },
    }),
  );
}

/**
 * Sends every pending reminder due on or before `asOf`, then takes it off the pending index. With `decide`, Winnow
 * ranks each reminder (use 7): only "act this week" ones are pushed, at most two pushes a week; the rest go to the digest.
 */
export async function deliverDue(asOf: string, decide?: Decide) {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p and gsi1sk <= :to',
      ExpressionAttributeValues: { ':p': PENDING, ':to': `${asOf}#￿` },
    }),
  );
  const delivered: { member: string; reminderId: string; email: boolean; pushedTo: number; channel: 'push' | 'digest'; actThisWeek?: number }[] = [];
  for (const item of res.Items ?? []) {
    const member = String(item.member);
    const reminder = item.reminder as StoredReminder;
    let push = true;
    let ranked: Record<string, number> | undefined;
    if (decide) {
      try {
        const r = await rankAlerts({ today: asOf, sendOn: reminder.sendOn }, [{ id: reminder.id, text: `${reminder.title}. ${reminder.body}` }], decide);
        ranked = r.answers[reminder.id];
        push = shouldPush(ranked ?? {}, await pushesThisWeek(member, asOf));
      } catch (err) {
        logWarn('reminders.ranker_skipped', err);
      }
    }
    const pushedTo =
      push && WS_ENDPOINT
        ? await pushToMember(WS_ENDPOINT, member, { type: 'reminder.due', reminderId: reminder.id, title: reminder.title, body: reminder.body })
        : 0;
    if (push && pushedTo) await countPush(member, asOf);
    let email = false;
    try {
      email = await sendEmail();
    } catch (err) {
      logWarn('reminders.email_failed', err);
    }
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'REMOVE gsi1pk, gsi1sk SET sentAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      }),
    );
    delivered.push({ member, reminderId: reminder.id, email, pushedTo, channel: push ? ('push' as const) : ('digest' as const), actThisWeek: ranked?.['act this week'] });
  }
  return delivered;
}
