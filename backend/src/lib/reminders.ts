// Year-end reminders (src/engine/reminders.ts builds them in the app). Stored per member; a daily EventBridge rule
// sends the due ones. Email is content-free by design: amounts and procedures stay inside the app.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { db } from './db';
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

/** Sends every pending reminder due on or before `asOf`, then takes it off the pending index. */
export async function deliverDue(asOf: string) {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p and gsi1sk <= :to',
      ExpressionAttributeValues: { ':p': PENDING, ':to': `${asOf}#￿` },
    }),
  );
  const delivered: { member: string; reminderId: string; email: boolean; pushedTo: number }[] = [];
  for (const item of res.Items ?? []) {
    const member = String(item.member);
    const reminder = item.reminder as StoredReminder;
    const pushedTo = WS_ENDPOINT
      ? await pushToMember(WS_ENDPOINT, member, { type: 'reminder.due', reminderId: reminder.id, title: reminder.title, body: reminder.body })
      : 0;
    let email = false;
    try {
      email = await sendEmail();
    } catch (err) {
      console.warn('reminder email failed', reminder.id, err);
    }
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'REMOVE gsi1pk, gsi1sk SET sentAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      }),
    );
    delivered.push({ member, reminderId: reminder.id, email, pushedTo });
  }
  return delivered;
}
