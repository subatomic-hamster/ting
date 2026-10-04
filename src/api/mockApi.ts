// Mock backend: runs Ting's own intake, OCR and engine in the browser, with 300–800 ms of simulated latency.
// The AWS backend runs the same code in Lambda; only the transport differs.

import {
  approveRules,
  localCompiler,
  type CompileResult,
} from "../compiler/compile";
import { DEMO_PLAN_OPTIONS } from "../data/demo";
import admin from "../fixtures/admin.json";
import { EMPLOYER, memberFor, type MemberRecord } from "../data/members";
import { currentMemberId, useAuth } from "../auth/auth";
import { buildDigest } from "../engine/digest";
import { appealDraft } from "../engine/eobAppeal";
import { decideInbound, forwardingAddress } from "../engine/inbox";
import { runLocalAgent } from "../engine/localAgent";
import { digestEmail, monthlyEmail } from "../engine/localEmails";
import { monthlyOverview } from "../engine/overview";
import { redactPhi } from "../engine/phi";
import { heuristicMatch } from "../engine/reconcile";
import { localIntent } from "../engine/answer";
import { optimize } from "../engine/schedule";
import type { PlanRules, Profile } from "../engine/types";
import dentists from "../fixtures/dentists.json";
import { useAppStore } from "../store";
import { localExplainer } from "../engine/explain";
import { classifyDocument } from "../intake/classify";
import { parseDescription } from "../intake/describe";
import { addDays, todayISO } from "../lib/dates";
import { localOcr } from "../services/ocr";
import { pdfText } from "../services/pdf";
import { apiContext as mock } from "./context";
import type {
  CarrierRecord,
  Contact,
  NotificationPrefs,
  ReadDocument,
  ReceivedDoc,
  ScheduledReminder,
  SentEmail,
  ShareSnapshot,
  TingApi,
} from "./index";
import { clearDraft, readDraft, saveDraft } from "../lib/drafts";
import { mockClaimEvent, recordPastClaim } from "./mockClaim";

const latency = () =>
  new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 500));
const uid = () => Math.random().toString(36).slice(2, 8);

async function fileText(file: File): Promise<string> {
  if (file.type === "application/pdf")
    return (await pdfText(file)).pages.join("\n");
  if (file.type.startsWith("image/"))
    return (await localOcr.recognize(file)).text;
  return file.text();
}

// --- ledger events ------------------------------------------------------------

const ledgerListeners = new Set<(e: unknown) => void>();
/** Claims fired this session per persona, replayed to each new subscriber like the WebSocket's `replay`. */
const firedClaims = new Map<string, unknown[]>();

/** Shared snapshots, this browser only (the AWS backend keeps them in DynamoDB). */
const shares = new Map<string, ShareSnapshot>();
const pending: {
  id: string;
  rules: PlanRules;
  evidence: CompileResult["evidence"];
  source: string;
  submittedAt: string;
}[] = [];
let prefs: NotificationPrefs = { cadence: "monthly", detail: "private" };
let contact: Contact | null = null;
const inbox: {
  senders: string[];
  held: {
    id: string;
    from: string;
    subject: string;
    text: string;
    receivedAt: string;
  }[];
} = { senders: [], held: [] };

/** Scheduled reminders, by member. In mock mode the app itself shows them when they come due. */
const reminders = new Map<string, Map<string, ScheduledReminder>>();
const remindersFor = () => {
  const member = memberFor(mock.personaId).memberId;
  if (!reminders.has(member)) reminders.set(member, new Map());
  return reminders.get(member)!;
};

/** Signed-up members, this browser only (the AWS backend keeps them in DynamoDB). */
const MEMBERS = "ting.members.v1";
function readMembers(): Record<string, MemberRecord> {
  try {
    return JSON.parse(localStorage.getItem(MEMBERS) ?? "{}") as Record<string, MemberRecord>;
  } catch {
    return {};
  }
}
function writeMember(record: MemberRecord): MemberRecord {
  localStorage.setItem(MEMBERS, JSON.stringify({ ...readMembers(), [record.memberId]: record }));
  return record;
}
function signedInMember(): string {
  const id = currentMemberId();
  if (!id) throw new Error("Sign in first.");
  return id;
}

// --- the in-browser email agent: what it read and what it sent, per member, kept across reloads ----------------

const AGENT_ADDRESS = "ting-dental@agentmail.to";
const MAX_KEPT = 50;
const receivedDocs = () => readDraft<ReceivedDoc[]>("received", mock.personaId) ?? [];
const sentEmails = () => readDraft<SentEmail[]>("outbox", mock.personaId) ?? [];
const savedContact = () => readDraft<Contact>("contact", mock.personaId) ?? null;
const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

/** Who the agent is working for: name and ids from the member, the address from their email settings or account. */
function agentMember() {
  const m = memberFor(mock.personaId);
  const email = savedContact()?.email || useAuth.getState().claims?.email || undefined;
  return { name: m.name, memberId: m.memberId, email, currentDentistId: m.currentDentistId };
}

const saveSent = (emails: SentEmail[]) => saveDraft("outbox", mock.personaId, [...emails, ...sentEmails()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_KEPT));

/** Tells the Email page (and anything else listening) that the record changed, like the live WebSocket's signal. */
const signal = () => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("ting:signal", { detail: { type: "corpus.updated" } }));

/** Lincoln's side of the record, derived from the member's ledger so /record isn't empty offline. */
function carrierRecordFor(profile: Profile): CarrierRecord {
  const m = memberFor(mock.personaId);
  const dentist = dentists.dentists.find((d) => d.id === m.currentDentistId);
  const { ledger } = profile;
  const byClaim = new Map<string, CarrierRecord["claims"][number]>();
  ledger.history
    .filter((h) => h.source !== "user")
    .forEach((h, n) => {
      const id = h.claimId ?? `LEDGER-${h.date}-${n}`;
      const owes = h.memberOwes ?? 0;
      // The ledger keeps what the plan paid and the member owes; the insurer's allowed amount is their sum.
      const allowed = Math.round((h.planPaid + owes) * 100) / 100;
      const c = byClaim.get(id) ?? {
        claimId: id,
        serviceDate: h.date,
        status: "paid",
        providerNpi: dentist ? "demo-0042" : "unknown",
        inNetwork: h.inNetwork !== false,
        origin: h.source,
        totals: { billed: 0, allowed: 0, planPaid: 0, memberOwes: 0 },
        lines: [],
      };
      c.lines.push({ lineNo: c.lines.length + 1, cdt: h.cdt, tooth: h.tooth, billed: allowed, allowed, planPaid: h.planPaid, memberOwes: owes, adjustments: [] });
      c.totals = {
        billed: c.totals.billed + allowed,
        allowed: c.totals.allowed + allowed,
        planPaid: Math.round((c.totals.planPaid + h.planPaid) * 100) / 100,
        memberOwes: Math.round((c.totals.memberOwes + owes) * 100) / 100,
      };
      byClaim.set(id, c);
    });
  return {
    member: {
      memberId: m.memberId,
      planId: profile.currentPlan.id,
      groupNumber: "00412345",
      employer: m.employer,
      coverageTier: m.coverage,
      effectiveDate: ledger.coverageStart,
    },
    plan: profile.currentPlan,
    accumulators: [{ planYear: ledger.planYear, deductibleMet: ledger.deductibleMet, annualMaxUsed: ledger.maxUsed, orthoUsed: ledger.orthoUsed, rolloverBalance: ledger.rolloverBalance }],
    claims: [...byClaim.values()].sort((a, b) => (a.serviceDate < b.serviceDate ? -1 : 1)),
    providers: dentist ? [{ npi: "demo-0042", name: dentist.name, inNetwork: dentist.inNetwork, dentistId: dentist.id }] : [],
  };
}

export const mockApi: TingApi = {
  async getMember() {
    const id = currentMemberId();
    return id ? (readMembers()[id] ?? null) : null;
  },

  async saveMember(input) {
    await latency();
    const memberId = signedInMember();
    const before = readMembers()[memberId];
    return writeMember({
      memberId,
      name: input.name.trim(),
      email: useAuth.getState().claims?.email ?? "",
      employer: EMPLOYER,
      createdAt: before?.createdAt ?? todayISO(),
      currentDentistId: input.currentDentistId ?? before?.currentDentistId ?? "d01",
      planId: input.planId,
      survey: input.survey,
      habits: before?.habits,
    });
  },

  async shareHabits(habits) {
    const record = readMembers()[signedInMember()];
    if (!record) throw new Error("Finish the sign-up survey first.");
    return writeMember({ ...record, habits });
  },

  async getSession() {
    await latency();
    const p = memberFor(mock.personaId);
    return {
      memberId: p.memberId,
      name: p.name,
      employer: p.employer,
      role: "member",
    };
  },

  async getPlans() {
    await latency();
    return DEMO_PLAN_OPTIONS;
  },

  async getLedger() {
    await latency();
    return memberFor(mock.personaId).profile(mock.asOf).ledger;
  },

  async parseDescription(text) {
    await latency();
    return parseDescription(text);
  },

  async readDocument(file) {
    const text = await fileText(file);
    const m = memberFor(mock.personaId);
    const red = redactPhi(text, { names: m.name === "Member" ? [] : [m.name], ids: [m.memberId] });
    return {
      docId: `doc-${uid()}`,
      text,
      ...classifyDocument(text, file.type.startsWith("image/")),
      deidentified: { removed: red.removed, preview: red.text.slice(0, 600) },
    } as ReadDocument;
  },

  async compilePlan(text) {
    await latency();
    return localCompiler.compile(text);
  },

  async explain(line, rules) {
    await latency();
    return localExplainer.explain(line, rules);
  },

  subscribeLedger(onEvent) {
    ledgerListeners.add(onEvent);
    // A claim fired before the app subscribed (the starting ledger was still loading) still lands.
    for (const event of firedClaims.get(mock.personaId) ?? []) onEvent(event);
    return () => ledgerListeners.delete(onEvent);
  },

  async fireMockClaim(profile, opts) {
    await latency();
    const event = mockClaimEvent(
      profile,
      memberFor(mock.personaId).memberId,
      opts?.underpay,
    );
    firedClaims.set(mock.personaId, [
      ...(firedClaims.get(mock.personaId) ?? []),
      event,
    ]);
    ledgerListeners.forEach((l) => l(event));
  },

  async createShareLink(scheduleKind, snapshot) {
    await latency();
    const token = `${mock.personaId}.${scheduleKind}.${uid()}`;
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://ting.example";
    const expiresAt = addDays(todayISO(), 30);
    if (snapshot) {
      const saved = {
        ...snapshot,
        sharedAt: new Date().toISOString(),
        expiresAt,
      };
      shares.set(token, saved);
      saveDraft("share-" + token, mock.personaId, saved);
    }
    return { url: `${origin}/share/${token}`, expiresAt };
  },

  async getShare(token) {
    const snap =
      shares.get(token) ??
      readDraft<ShareSnapshot>("share-" + token, token.split(".")[0]);
    return snap && snap.expiresAt >= todayISO() ? snap : null;
  },

  async resetDemo() {
    firedClaims.delete(mock.personaId);
    clearDraft("received", mock.personaId);
    clearDraft("outbox", mock.personaId);
  },

  async submitRules(rules, evidence, source) {
    await latency();
    const id = uid();
    pending.push({
      id,
      rules,
      evidence,
      source,
      submittedAt: new Date().toISOString(),
    });
    return { id, status: "pending" };
  },
  async pendingRules() {
    return [...pending];
  },
  async approveSubmittedRules(id) {
    const i = pending.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("No such submission");
    const [p] = pending.splice(i, 1);
    return approveRules(p.rules);
  },

  async ask(question) {
    await latency();
    const intent = localIntent(question);
    if (intent === "medical_advice")
      return {
        intent,
        answer:
          "That's a question for your dentist. Ting helps with costs and timing, not with what treatment you need.",
      };
    if (intent === "out_of_scope")
      return {
        intent,
        answer:
          "Ting can answer questions about your dental plan, your costs and when to schedule work.",
      };
    return { intent, answerBy: "engine" };
  },

  async getProfile() {
    return null; // the store already holds the persona's profile
  },
  async getContact() {
    contact = savedContact();
    return { contact, agent: AGENT_ADDRESS, live: false };
  },
  async setContact(next) {
    contact = next;
    saveDraft("contact", mock.personaId, next);
    return next;
  },
  async getOutbox() {
    return sentEmails();
  },
  async getReceived() {
    return receivedDocs();
  },
  async emailAgent(mail) {
    await latency();
    const store = useAppStore.getState();
    const member = agentMember();
    const from = mail.fromDentist ? "frontdesk@collegehilldental.example" : (member.email ?? "you@example.com");
    const out = runLocalAgent({
      mail: { from, ...mail },
      member,
      profile: store.profile,
      today: store.profile.asOf,
      at: new Date().toISOString(),
      contact: savedContact(),
      web: origin(),
    });
    // Apply what the agent decided to the member's record the way the live path does after it refetches the profile.
    if (out.claim) recordPastClaim(out.claim, out.deductible);
    if (out.procedures.length) {
      const err = useAppStore.getState().addProcedures(out.procedures);
      if (err) out.doc.flags = [...(out.doc.flags ?? []), `Ting couldn't add the new work: ${err}`];
    }
    saveDraft("received", mock.personaId, [out.doc, ...receivedDocs().filter((d) => d.docId !== out.doc.docId)].slice(0, MAX_KEPT));
    saveSent(out.emails);
    signal();
    return { accepted: true, from };
  },
  async sendMonthlyNow() {
    await latency();
    const p = useAppStore.getState().profile;
    const o = monthlyOverview(p, optimize(p, { horizon: 2 }).cheapest);
    const { name, email } = agentMember();
    const r = monthlyEmail(name.split(/\s+/)[0] || "there", o, savedContact()?.detail !== "private", origin());
    saveSent([{ at: new Date().toISOString(), kind: "monthly", to: email ?? "you", subject: r.subject, text: r.text, html: r.html, delivered: "outbox" }]);
    signal();
    return { sent: true };
  },
  async getCarrierRecord() {
    return carrierRecordFor(useAppStore.getState().profile);
  },
  async changePlan(planId) {
    useAppStore.getState().setCurrentPlan(planId);
  },

  async getInbox() {
    await latency();
    return {
      address: forwardingAddress(memberFor(mock.personaId).memberId),
      senders: [...inbox.senders],
      held: inbox.held.map(({ id, from, subject, receivedAt }) => ({
        id,
        from,
        subject,
        receivedAt,
      })),
    };
  },
  async simulateForward(mail) {
    await latency();
    const d = decideInbound(
      { ...mail, auth: { spf: true, dkim: true, dmarc: true } },
      undefined,
      inbox.senders,
    );
    if (d.action === "reject") return { status: "rejected", reason: d.reason };
    if (d.action === "hold") {
      const id = uid();
      inbox.held.push({ id, ...mail, receivedAt: new Date().toISOString() });
      return { status: "held", reason: d.reason };
    }
    const text = `${mail.subject}\n${mail.text}`;
    return {
      status: "accepted",
      doc: { docId: `mail-${uid()}`, text, ...classifyDocument(text, false) },
    };
  },
  async approveSender(address, heldId) {
    await latency();
    inbox.senders = [...new Set([...inbox.senders, address.toLowerCase()])];
    const held = inbox.held.find((h) => h.id === heldId);
    inbox.held = inbox.held.filter((h) => h.id !== heldId);
    if (!held) return { senders: inbox.senders };
    const text = `${held.subject}\n${held.text}`;
    return {
      senders: inbox.senders,
      doc: { docId: `mail-${uid()}`, text, ...classifyDocument(text, false) },
    };
  },

  async matchInvoice(invoice, claims) {
    await latency();
    return { probs: heuristicMatch(invoice, claims), source: "heuristic" };
  },

  async draftAppeal(discrepancy, plan) {
    await latency();
    return { text: appealDraft(discrepancy, plan), source: "template" };
  },

  async getAdminInsights() {
    await latency();
    const shown = admin.groups.filter((g) => g.n >= 20);
    return {
      employer: admin.employer,
      groups: shown,
      hidden: admin.groups.length - shown.length,
      isDemoData: true,
    };
  },
  async getConsent() {
    return {};
  },
  async giveConsent() {},
  async getPreferences() {
    return prefs;
  },
  async savePreferences(next) {
    await latency();
    prefs = next;
    return prefs;
  },
  async getDigest() {
    await latency();
    const profile = memberFor(mock.personaId).profile(mock.asOf);
    return {
      ...buildDigest(profile, optimize(profile, { horizon: 2 }).cheapest),
      source: "template",
    };
  },
  async sendTestDigest() {
    await latency();
    const p = useAppStore.getState().profile;
    const d = buildDigest(p, optimize(p, { horizon: 2 }).cheapest);
    const { name, email } = agentMember();
    const isPrivate = prefs.detail !== "detailed";
    const r = digestEmail(name.split(/\s+/)[0] || "there", d.title, d.body, !isPrivate, origin());
    saveSent([{ at: new Date().toISOString(), kind: "reminder", to: email ?? "you", subject: r.subject, text: r.text, html: r.html, delivered: "outbox" }]);
    signal();
    return { emailed: false, pushedTo: 0, private: isPrivate };
  },
  async deleteMyData() {},

  async scheduleReminder(reminder) {
    await latency();
    const scheduled: ScheduledReminder = {
      reminderId: reminder.id,
      sendOn: reminder.sendOn,
      channels: ["in_app"],
    };
    remindersFor().set(reminder.id, scheduled);
    return scheduled;
  },

  async cancelReminder(reminderId) {
    await latency();
    remindersFor().delete(reminderId);
  },
};
