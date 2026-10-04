// Email bodies (HTML with inline styles for mail clients, plus plain text). Amounts come from the engine or the
// document itself; these functions only format.
import { usd } from '../../../src/engine/format';
import { monthName, type MonthlyOverview } from '../../../src/engine/overview';
import type { WorkPlan } from '../../../src/engine/agentPlan';

const WEB = process.env.WEB_ORIGIN ?? '';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

interface Block {
  heading?: string;
  lines: string[];
  tone?: 'normal' | 'alert' | 'good';
}

function render(subject: string, intro: string, blocks: Block[], cta = 'Open Ting'): Rendered {
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="background:#ad1f2d;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">Ting <span style="font-weight:400;color:#fcd9a8;font-size:13px">dental benefits</span></td></tr>
<tr><td style="padding:0;font-size:0;line-height:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td width="46%" height="4" style="background:#ad1f2d"></td><td width="18%" style="background:#fe242a"></td><td width="18%" style="background:#f15a23"></td><td width="18%" style="background:#f9a61a"></td></tr></table></td></tr>
<tr><td style="padding:22px 24px 6px;font-size:15px;line-height:1.5">${esc(intro)}</td></tr>
${blocks
  .map(
    (b) =>
      `<tr><td style="padding:10px 24px"><div style="border-radius:10px;padding:12px 14px;${
        b.tone === 'alert'
          ? 'background:#fef2f2;border:1px solid #fecaca'
          : b.tone === 'good'
            ? 'background:#f0fdf4;border:1px solid #bbf7d0'
            : 'background:#fafaf9;border:1px solid #e7e5e4'
      }">${b.heading ? `<div style="font-weight:600;font-size:14px;margin-bottom:6px">${esc(b.heading)}</div>` : ''}${b.lines
        .map((l) => `<div style="font-size:14px;line-height:1.5;margin:2px 0">${esc(l)}</div>`)
        .join('')}</div></td></tr>`,
  )
  .join('\n')}
<tr><td style="padding:16px 24px 22px"><a href="${esc(WEB)}" style="display:inline-block;background:#ad1f2d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600;font-size:14px">${esc(cta)}</a></td></tr>
<tr><td style="padding:0 24px 20px;font-size:11px;color:#78716c">Educational estimate — not insurance or tax advice. Reply to this email or forward anything about your dental care to Ting.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    intro,
    '',
    ...blocks.flatMap((b) => [...(b.heading ? [b.heading.toUpperCase()] : []), ...b.lines.map((l) => `- ${l}`), '']),
    `${cta}: ${WEB}`,
    '',
    'Educational estimate — not insurance or tax advice.',
  ].join('\n');
  return { subject, text, html };
}

export interface Understanding {
  docType: string;
  summary: string;
  provider?: string;
  serviceDate?: string;
  procedures: {
    label: string;
    status: string;
    tooth?: number;
    billed?: number;
    planPaid?: number;
    memberOwes?: number;
    urgency?: string;
  }[];
  amounts: { label: string; amount: number }[];
  followUps: string[];
}

const DOC_NAMES: Record<string, string> = {
  eob: 'an Explanation of Benefits',
  dentist_invoice: "your dentist's bill",
  dentist_note: 'a note from your dentist',
  treatment_plan: 'a treatment plan',
  xray_report: 'an x-ray or exam report',
  plan_notice: 'a notice about your plan',
  fsa_receipt: 'an FSA receipt',
  appointment: 'an appointment message',
  other: 'your message',
};

export function replyEmail(
  subject: string,
  u: Understanding,
  opts: {
    plan?: WorkPlan;
    recorded: string[];
    flags: string[];
    urgent?: string;
  },
): Rendered {
  const blocks: Block[] = [];
  if (opts.urgent)
    blocks.push({
      heading: 'Needs your attention soon',
      lines: [opts.urgent],
      tone: 'alert',
    });
  blocks.push({
    heading: 'What I found',
    lines: [
      u.summary,
      ...(u.provider ? [`Provider: ${u.provider}`] : []),
      ...(u.serviceDate ? [`Date of service: ${shortDate(u.serviceDate)}`] : []),
      ...u.procedures.map(
        (p) =>
          `${p.label}${p.tooth ? ` (#${p.tooth})` : ''} — ${p.status}` +
          [
            p.billed !== undefined && `billed ${usd(p.billed)}`,
            p.planPaid !== undefined && `plan paid ${usd(p.planPaid)}`,
            p.memberOwes !== undefined && `you owe ${usd(p.memberOwes)}`,
          ]
            .filter(Boolean)
            .map((x) => `, ${x}`)
            .join(''),
      ),
      ...u.amounts.map((a) => `${a.label}: ${usd(a.amount)}`),
    ],
  });
  if (opts.recorded.length) blocks.push({ heading: 'What I did', lines: opts.recorded, tone: 'good' });
  if (opts.flags.length)
    blocks.push({
      heading: 'Worth checking',
      lines: opts.flags,
      tone: 'alert',
    });
  if (opts.plan?.items.length) {
    const p = opts.plan;
    blocks.push({
      heading: 'Your plan for this work',
      lines: [
        ...p.items.map(
          (i) =>
            `${i.label}: ${i.locked ? 'as soon as possible' : `around ${shortDate(i.date)}`}, you pay about ${usd(i.memberOwes)} (plan pays ${usd(i.planPaid)})`,
        ),
        ...(p.dentist
          ? [
              `${p.dentist.isCurrent ? 'Your dentist' : 'Suggested dentist'}: ${p.dentist.name}, ${p.dentist.inNetwork ? 'in network' : 'out of network'}, ${p.dentist.distanceMiles} mi`,
            ]
          : []),
        ...(p.alternative
          ? [`Or ${p.alternative.name} (${p.alternative.distanceMiles} mi, in network) would save you about ${usd(p.alternative.saves)}.`]
          : []),
        ...p.monthly.slice(0, 4).map((m) => `${monthName(m.month)}: ${usd(m.memberOwes)} out of pocket`),
        p.maxThisYear.overBy > 0
          ? `This year's work needs ${usd(p.maxThisYear.overBy)} more than your ${usd(p.maxThisYear.annualMax)} annual maximum; Ting moved what it safely could into next year.`
          : `You're within your ${usd(p.maxThisYear.annualMax)} annual maximum for this year.`,
      ],
    });
    if (p.questions.length)
      blocks.push({
        heading: 'Questions for your dentist',
        lines: p.questions.slice(0, 3),
      });
  }
  if (u.followUps.length) blocks.push({ heading: 'Next steps', lines: u.followUps.slice(0, 4) });
  return render(
    subject.startsWith('Re:') ? subject : `Re: ${subject || 'your email'}`,
    `Thanks, I've read ${DOC_NAMES[u.docType] ?? DOC_NAMES.other} and added it to your Ting record.`,
    blocks,
    'See it in Ting',
  );
}

export function monthlyEmail(name: string, o: MonthlyOverview, detailed: boolean): Rendered {
  const title = `Your dental benefits in ${monthName(o.month)}`;
  if (!detailed) return render(title, `Hi ${name}, your monthly dental benefits overview is ready. For your privacy, the details are in the app.`, []);
  const blocks: Block[] = [
    {
      heading: o.onTrack.status === 'on track' ? 'On track' : o.onTrack.status === 'room to use' ? 'Room left to use' : 'Over your maximum',
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
  if (o.done.length)
    blocks.push({
      heading: 'Done this month',
      lines: o.done.map((d) => `${d.label} on ${shortDate(d.date)}: plan paid ${usd(d.planPaid)}`),
    });
  blocks.push({
    heading: 'Coming up',
    lines: o.upcoming.length
      ? o.upcoming.map((u) => `${u.label} around ${shortDate(u.date)}: you pay about ${usd(u.memberOwes)}${u.inNetwork ? '' : ' (out of network)'}`)
      : ['Nothing scheduled in the next two months.'],
  });
  blocks.push({
    heading: 'Out of pocket',
    lines: [`This plan year: ${usd(o.owedThisYear)}. Next year so far: ${usd(o.owedNextYear)}.`],
  });
  if (o.suggestions.length) blocks.push({ heading: 'What you could do', lines: o.suggestions });
  return render(title, `Hi ${name}, here's your dental benefits overview for ${monthName(o.month)}.`, blocks);
}

export function urgentEmail(name: string, what: string, details: string[], actions: string[], detailed: boolean): Rendered {
  if (!detailed)
    return render(
      'Important: a dental benefits update needs your attention',
      `Hi ${name}, something important came in about your dental care. Open Ting to see it.`,
      [],
    );
  return render(`Important: ${what}`, `Hi ${name}, this needs your attention soon.`, [
    { heading: what, lines: details, tone: 'alert' },
    ...(actions.length ? [{ heading: 'What to do', lines: actions }] : []),
  ]);
}

export function welcomeEmail(name: string, agent: string): Rendered {
  return render('Ting is set up for your email', `Hi ${name}, Ting will send your monthly overview and anything urgent to this address.`, [
    {
      heading: 'Send Ting anything about your dental care',
      lines: [
        `Forward or email ${agent}: EOBs, dentist bills, treatment plans, notes from your dentist, plan notices.`,
        'Ting reads it, adds it to your record, plans any work, and replies with what it found.',
      ],
    },
  ]);
}

export function unknownSenderEmail(agent: string): Rendered {
  return render(
    "Ting doesn't know this address yet",
    'Thanks for your email. To keep your dental information private, Ting only reads mail from addresses linked to a member.',
    [
      {
        lines: [`Add this address in Ting (Dashboard → Email), then send it to ${agent} again.`],
      },
    ],
  );
}
