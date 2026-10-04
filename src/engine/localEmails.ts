// Email bodies for the in-browser agent (offline demo). Same look and wording as backend/src/lib/emailTemplates.ts, which
// reads process.env and so can't run in the browser. Amounts come from the engine or the document; this only formats.
import type { WorkPlan } from './agentPlan';
import { usd } from './format';
import { monthName, type MonthlyOverview } from './overview';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

export interface Block {
  heading?: string;
  lines: string[];
  tone?: 'normal' | 'alert' | 'good';
}

const TONE = {
  alert: 'background:#fef2f2;border:1px solid #fecaca',
  good: 'background:#f0fdf4;border:1px solid #bbf7d0',
  normal: 'background:#fafaf9;border:1px solid #e7e5e4',
};

export function render(subject: string, intro: string, blocks: Block[], cta = 'Open Ting', web = ''): Rendered {
  const body = blocks
    .map(
      (b) =>
        `<tr><td style="padding:10px 24px"><div style="border-radius:10px;padding:12px 14px;${TONE[b.tone ?? 'normal']}">${
          b.heading ? `<div style="font-weight:600;font-size:14px;margin-bottom:6px">${esc(b.heading)}</div>` : ''
        }${b.lines.map((l) => `<div style="font-size:14px;line-height:1.5;margin:2px 0">${esc(l)}</div>`).join('')}</div></td></tr>`,
    )
    .join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:16px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="background:#ad1f2d;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">Ting <span style="font-weight:400;color:#fcd9a8;font-size:13px">dental benefits</span></td></tr>
<tr><td style="padding:22px 24px 6px;font-size:15px;line-height:1.5">${esc(intro)}</td></tr>
${body}
<tr><td style="padding:16px 24px 22px"><a href="${esc(web)}" style="display:inline-block;background:#ad1f2d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600;font-size:14px">${esc(cta)}</a></td></tr>
<tr><td style="padding:0 24px 20px;font-size:11px;color:#78716c">Reply to this email or forward anything about your dental care to Ting.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [intro, '', ...blocks.flatMap((b) => [...(b.heading ? [b.heading.toUpperCase()] : []), ...b.lines.map((l) => `- ${l}`), '']), cta, ''].join('\n');
  return { subject, text, html };
}

export interface ReplyFacts {
  docName: string;
  summary: string;
  /** One line per thing found in the document. */
  found: string[];
  did: string[];
  flags: string[];
  /** What it means for the plan: annual max, deductible, what the member pays. */
  means: string[];
  plan?: WorkPlan;
  urgent?: string;
  nextSteps: string[];
}

export function replyEmail(subject: string, f: ReplyFacts, web = ''): Rendered {
  const blocks: Block[] = [];
  if (f.urgent) blocks.push({ heading: 'Needs your attention soon', lines: [f.urgent], tone: 'alert' });
  blocks.push({ heading: 'What I found', lines: [f.summary, ...f.found] });
  blocks.push({ heading: 'What I did', lines: f.did.length ? f.did : ['Nothing changed on your plan.'], tone: 'good' });
  if (f.flags.length) blocks.push({ heading: 'Worth checking', lines: f.flags, tone: 'alert' });
  const means = [...f.means];
  if (f.plan?.items.length)
    means.push(
      ...f.plan.items.map(
        (i) => `${i.label}: ${i.locked ? 'as soon as possible' : `around ${shortDate(i.date)}`}, you pay about ${usd(i.memberOwes)} (plan pays ${usd(i.planPaid)})`,
      ),
    );
  if (means.length) blocks.push({ heading: 'What it means for your plan', lines: means });
  if (f.nextSteps.length) blocks.push({ heading: 'Next steps', lines: f.nextSteps.slice(0, 4) });
  return render(
    subject.startsWith('Re:') ? subject : `Re: ${subject || 'your email'}`,
    `Thanks, I've read ${f.docName} and added it to your Ting record.`,
    blocks,
    'See it in Ting',
    web,
  );
}

export function monthlyEmail(name: string, o: MonthlyOverview, detailed: boolean, web = ''): Rendered {
  const title = `Your dental benefits in ${monthName(o.month)}`;
  if (!detailed) return render(title, `Hi ${name}, your monthly dental benefits overview is ready. For your privacy, the details are in the app.`, [], 'Open Ting', web);
  const blocks: Block[] = [
    {
      heading: o.onTrack.status === 'on track' ? 'On track for your coverage' : o.onTrack.status === 'room to use' ? 'Room left to use' : 'Over your maximum',
      lines: [o.onTrack.message],
      tone: o.onTrack.status === 'on track' ? 'good' : 'alert',
    },
    {
      heading: 'Your annual maximum',
      lines: [
        `Used ${usd(o.maxUsed)}, scheduled ${usd(o.maxScheduled)} of ${usd(o.annualMax)} (${Math.round(o.usedPct * 100)}%). ${o.monthsLeft} month${o.monthsLeft === 1 ? '' : 's'} left in the plan year.`,
      ],
    },
  ];
  if (o.done.length) blocks.push({ heading: 'Done this month', lines: o.done.map((d) => `${d.label} on ${shortDate(d.date)}: plan paid ${usd(d.planPaid)}`) });
  blocks.push({
    heading: 'Coming up',
    lines: o.upcoming.length
      ? o.upcoming.map((u) => `${u.label} around ${shortDate(u.date)}: you pay about ${usd(u.memberOwes)}${u.inNetwork ? '' : ' (out of network)'}`)
      : ['Nothing scheduled in the next two months.'],
  });
  blocks.push({ heading: 'Out of pocket', lines: [`This plan year: ${usd(o.owedThisYear)}. Next year so far: ${usd(o.owedNextYear)}.`] });
  if (o.suggestions.length) blocks.push({ heading: 'What you could do', lines: o.suggestions });
  return render(title, `Hi ${name}, here's your dental benefits overview for ${monthName(o.month)}.`, blocks, 'Open Ting', web);
}

export function urgentEmail(name: string, what: string, details: string[], actions: string[], detailed: boolean, web = ''): Rendered {
  if (!detailed)
    return render('Important: a dental benefits update needs your attention', `Hi ${name}, something important came in about your dental care. Open Ting to see it.`, [], 'Open Ting', web);
  return render(
    `Important: ${what}`,
    `Hi ${name}, this needs your attention soon.`,
    [{ heading: what, lines: details, tone: 'alert' }, ...(actions.length ? [{ heading: 'What to do', lines: actions }] : [])],
    'Open Ting',
    web,
  );
}

export function digestEmail(name: string, title: string, body: string, detailed: boolean, web = ''): Rendered {
  return detailed
    ? render(title, `Hi ${name}, here's your update.`, [{ lines: body.split('\n') }], 'Open Ting', web)
    : render('You have a dental benefits update', `Hi ${name}, sign in to Ting to see it. For your privacy, details stay inside the app.`, [], 'Open Ting', web);
}
