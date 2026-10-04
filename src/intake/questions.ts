import { round2 } from "../engine/adjudicate";
import { CDT, cdtLabel } from "../engine/cdt";
import { usd } from "../engine/format";
import { evaluateSchedule } from "../engine/schedule";
import type { PlannedProcedure, Profile } from "../engine/types";
import { EXPLICIT_TOOTH_P } from "./describe";
import type { IntakeItem, IntakeQuestion } from "./types";

/** A code nobody stated the size of (surfaces) is shown by its family name, so no number appears that wasn't said. */
const FAMILY: [RegExp, string][] = [
  [/^D239[1-4]$/, "Tooth-colored filling"],
  [/^D21[4-6]\d$/, "Silver filling"],
];
const STATED_P = 0.85;

/** Ask only when guessing wrong costs more than this in expectation; below it the answer is accepted as "inferred". */
export const ASK_THRESHOLD = 25;

/** Clinical order on one tooth: root canal, then buildup/post, then crown or bridge. */
function stage(cdt: string): number | undefined {
  if (CDT[cdt]?.category === "endodontics") return 0;
  if (cdt === "D2950" || cdt === "D2954") return 1;
  if (CDT[cdt]?.prepDated) return 2;
  return undefined;
}

/** Top answer of each item as a planned procedure. Items with no known fee can't be priced and are left out. */
export function toProcedures(
  items: IntakeItem[],
  profile: Profile,
): PlannedProcedure[] {
  const procs: PlannedProcedure[] = items.flatMap((item) => {
    const cdt = item.candidates[0]?.cdt;
    if (!cdt) return [];
    const table = profile.fees[cdt];
    const fee = item.fee ?? table?.billed;
    if (fee === undefined) return [];
    const tooth = item.teeth[0];
    const family =
      (item.candidates[0]?.p ?? 0) < STATED_P
        ? FAMILY.find(([re]) => re.test(cdt))?.[1]
        : undefined;
    return [
      {
        id: item.id,
        cdt,
        tooth: tooth?.tooth,
        fee,
        feeSource:
          item.fee !== undefined
            ? { kind: "quote", label: "Fee supplied in your treatment details" }
            : table?.source,
        allowedFee: table?.inNetwork,
        allowedFeeSource: table?.source,
        inNetwork: true,
        ...(item.fee !== undefined && {
          allowedFee: undefined,
          allowedFeeSource: undefined,
          allowancePending: true,
        }),
        ...(item.visit && { visit: item.visit }),
        // Priced on Ting's best guess, but only a tooth someone named is ever shown as a number.
        ...(tooth && tooth.p < EXPLICIT_TOOTH_P && { toothGuessed: true }),
        ...(family && { label: family }),
      },
    ];
  });
  // Each step on a tooth depends on the latest earlier step on that tooth.
  return procs.map((p) => {
    const s = stage(p.cdt);
    if (s === undefined || p.tooth === undefined) return p;
    const before = procs
      .filter((q) => q.tooth === p.tooth && (stage(q.cdt) ?? 9) < s)
      .sort((a, b) => (stage(b.cdt) ?? 0) - (stage(a.cdt) ?? 0))[0];
    return before ? { ...p, dependsOn: [before.id] } : p;
  });
}

/** Hypothetical amounts use only actual service history; an unknown prior date is collected in intake. */
function owesToday(items: IntakeItem[], profile: Profile): Map<string, number> {
  const procedures = toProcedures(items, profile);
  const ev = evaluateSchedule(
    { ...profile, procedures },
    procedures.map((p) => ({ id: p.id, date: profile.asOf })),
  );
  return new Map(ev.lines.map((l) => [l.id, l.memberOwes]));
}

interface Answer {
  value: string;
  label: string;
  /** Finishes "If ... instead you'd pay". */
  phrase: string;
  p: number;
  items: IntakeItem[];
  replacing: ReadonlySet<string>;
}

/**
 * Value of information: reprice each uncertain field of each item under every answer, using the engine's own bill.
 * expected cost of guessing = sum over answers a other than the top of p(a) * |owe(a) - owe(top)|.
 * Option probabilities are normalised over the listed answers.
 */
export function intakeQuestions(
  items: IntakeItem[],
  profile: Profile,
): IntakeQuestion[] {
  const replacingNow = new Set(
    items.filter((i) => (i.replacement ?? 0) >= 0.5).map((i) => i.id),
  );
  const out: IntakeQuestion[] = [];

  for (const item of items) {
    // One appointment, one set of questions: asked on its first item, and a code answer covers the whole visit.
    if (item.visit && items.find((i) => i.visit === item.visit) !== item)
      continue;
    const swap = (v: IntakeItem) =>
      items.map((i) => (i.id === item.id ? v : i));
    const swapCode = (cdt: string) =>
      items.map((i) =>
        i.id === item.id || (item.visit && i.visit === item.visit)
          ? {
              ...i,
              candidates: [{ cdt, p: 1 }],
              fee: i.id === item.id ? i.fee : undefined,
            }
          : i,
      );
    const share = (ps: number[]) =>
      ps.map((p) => p / (ps.reduce((s, q) => s + q, 0) || 1));
    const fields: {
      field: IntakeQuestion["field"];
      prompt: string;
      answers: Answer[];
    }[] = [];

    if (item.candidates.length > 1) {
      const ps = share(item.candidates.map((c) => c.p));
      fields.push({
        field: "cdt",
        prompt: `Which procedure is "${item.phrase}"?`,
        answers: item.candidates.map((c, i) => ({
          value: c.cdt,
          label: cdtLabel(c.cdt),
          phrase: `it's ${cdtLabel(c.cdt)}`,
          p: ps[i],
          // The stated fee belongs to the top code only.
          items:
            i === 0
              ? swapCode(c.cdt)
              : swapCode(c.cdt).map((x) =>
                  x.id === item.id ? { ...x, fee: undefined } : x,
                ),
          replacing: replacingNow,
        })),
      });
    }
    if (item.teeth.length > 1) {
      const ps = share(item.teeth.map((t) => t.p));
      fields.push({
        field: "tooth",
        prompt: `Which tooth is "${item.phrase}" about?`,
        answers: item.teeth.map((t, i) => ({
          value: String(t.tooth),
          label: `Tooth #${t.tooth}`,
          phrase: `it's tooth #${t.tooth}`,
          p: ps[i],
          items: swap({ ...item, teeth: [{ tooth: t.tooth, p: 1 }] }),
          replacing: replacingNow,
        })),
      });
    }

    for (const { field, prompt, answers } of fields) {
      const priced = answers.map((a) => ({
        a,
        owes: owesToday(a.items, profile).get(item.id),
      }));
      if (priced.some((x) => x.owes === undefined)) continue;
      const rows = priced.map((x) => ({ a: x.a, owes: x.owes ?? 0 }));
      const top = rows.reduce((best, r) => (r.a.p > best.a.p ? r : best));
      const alts = rows.filter((r) => r !== top);
      const cost = round2(
        alts.reduce((s, r) => s + r.a.p * Math.abs(r.owes - top.owes), 0),
      );
      if (cost <= ASK_THRESHOLD) continue;
      const worst = alts.reduce((best, r) =>
        Math.abs(r.owes - top.owes) > Math.abs(best.owes - top.owes) ? r : best,
      );
      const delta = round2(worst.owes - top.owes);
      out.push({
        itemId: item.id,
        field,
        prompt,
        why: `If ${worst.a.phrase} instead you'd pay ${usd(Math.abs(delta))} ${delta > 0 ? "more" : "less"}.`,
        options: rows.map((r) => ({
          value: r.a.value,
          label: r.a.label,
          p: r.a.p,
          owes: r.owes,
        })),
        preselected: top.a.value,
        expectedCostOfGuessing: cost,
      });
    }
  }
  return out;
}
