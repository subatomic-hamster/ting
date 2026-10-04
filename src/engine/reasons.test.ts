import { describe, expect, it } from "vitest";
import { ACME_LOW, DEMO_PROFILE } from "../data/demo";
import { explainLine } from "./explain";
import { placementReasons } from "./reasons";
import { isOverdue, optimize, validatePlacements } from "./schedule";
import type { PlannedProcedure, Profile } from "./types";

// Explicit fees on every procedure, so these tests don't move when the demo fee table does.
const NO_FSA: Profile["money"] = { fsaOffered: false, fsaBalance: 0, fsaRule: { kind: "none" }, marginalTaxRate: 0 };
const proc = (id: string, cdt: string, extra: Partial<PlannedProcedure> = {}): PlannedProcedure => ({
  id,
  cdt,
  fee: 1180,
  allowedFee: 1000,
  inNetwork: true,
  ...extra,
});
const profileOf = (procedures: PlannedProcedure[], asOf: string): Profile => ({
  ...DEMO_PROFILE,
  asOf,
  currentPlan: ACME_LOW,
  procedures,
  money: NO_FSA,
  ledger: { ...DEMO_PROFILE.ledger, planYear: Number(asOf.slice(0, 4)), maxUsed: 0, deductibleMet: 0, history: [] },
});

const WORKED = [
  proc("rc19", "D3330", { tooth: 19, locked: true, deadline: "2026-11-15" }),
  proc("bu19", "D2950", { tooth: 19, fee: 330, allowedFee: 250, dependsOn: ["rc19"], deadline: "2027-03-31" }),
  proc("cr19", "D2740", { tooth: 19, fee: 1450, allowedFee: 1200, dependsOn: ["bu19"], deadline: "2027-03-31" }),
  proc("cr30", "D2740", { tooth: 30, fee: 1450, allowedFee: 1200, deadline: "2027-03-31" }),
];

describe("overdue dentist deadlines never crash the optimizer", () => {
  // "Simulate Dec 1" jumps past an October deadline.
  const p = profileOf(WORKED, "2026-12-01");

  it("schedules the overdue visit at the earliest date and flags it", () => {
    expect(isOverdue(p, WORKED[0])).toBe(true);
    const r = optimize(p, { horizon: 2 });
    for (const plan of [r.cheapest, r.fastest, r.balanced]) {
      expect(plan.placements.find((x) => x.id === "rc19")?.date).toBe("2026-12-01");
      expect(validatePlacements(p, plan.placements)).toEqual([]);
      expect(plan.warnings).toBeUndefined();
    }
    const reasons = placementReasons(p, r.cheapest, { horizon: 2 });
    expect(reasons.rc19.kind).toBe("overdue");
    expect(reasons.rc19.overdue).toBe(true);
    expect(reasons.rc19.text).toMatch(/^Overdue: your dentist wanted this by Nov 15, 2026\. Book as soon as possible\./);
  });

  it("an overdue visit that others depend on can spill into the new year without throwing", () => {
    const late = profileOf(
      [proc("a", "D3330", { tooth: 19, deadline: "2026-12-01" }), proc("b", "D2950", { tooth: 19, fee: 330, allowedFee: 250, dependsOn: ["a"], deadline: "2026-12-05" })],
      "2026-12-30",
    );
    const r = optimize(late, { horizon: 2 });
    expect(r.fastest.placements.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(r.fastest.placements.find((x) => x.id === "a")?.date).toBe("2026-12-30");
  });

  it("a genuinely infeasible future deadline degrades to the fastest schedule with a warning", () => {
    const tight = profileOf(
      [proc("a", "D3330", { tooth: 19 }), proc("b", "D2950", { tooth: 19, fee: 330, allowedFee: 250, dependsOn: ["a"], deadline: "2026-12-03" })],
      "2026-12-01",
    );
    const r = optimize(tight, { horizon: 2 });
    expect(r.cheapest.warnings?.[0]).toMatch(/fastest order/);
    expect(r.cheapest.placements).toEqual(r.fastest.placements);
    expect(r.fastest.placements.find((x) => x.id === "b")?.date).toBe("2026-12-08");
  });
});

describe("per-procedure placement reasons", () => {
  const p = profileOf(WORKED, "2026-10-05");
  const r = optimize(p, { horizon: 2 });
  const cheap = placementReasons(p, r.cheapest, { horizon: 2 });

  it("explains a move into the new plan year with the max left and the extra the plan pays", () => {
    expect(r.cheapest.placements.find((x) => x.id === "cr30")?.date).toBe("2027-01-04");
    // cr30 alone isn't capped, but with the other year-end work it would be.
    expect(cheap.cr30.kind).toBe("moved");
    expect(cheap.cr30.text).toMatch(/^Moved to Jan 4, 2027 with the other year-end work: .*your 2026 max .*runs out/);
  });

  it("a single crown with little max left moves to January, saying how much the plan pays more", () => {
    const q = profileOf([proc("cr", "D2740", { tooth: 30, fee: 1450, allowedFee: 1200, deadline: "2027-03-31" })], "2026-10-05");
    q.ledger.maxUsed = 1300;
    q.ledger.deductibleMet = 50;
    const plan = optimize(q, { horizon: 2 }).cheapest;
    expect(plan.placements[0].date).toBe("2027-01-04");
    const reason = placementReasons(q, plan, { horizon: 2 }).cr;
    expect(reason.kind).toBe("moved");
    expect(reason.text).toMatch(/^Moved to Jan 4, 2027: your 2026 max has \$200 left; in 2027 \$1,500 is available, so the plan pays \$\d[\d,.]* more and you pay \$\d[\d,.]* less\./);
  });

  it("names locked, dependency and kept-in-year reasons", () => {
    expect(cheap.rc19.kind).toBe("locked");
    expect(cheap.bu19.kind).toBe("dependency");
    expect(cheap.bu19.text).toMatch(/^Waits for root canal/);
    const fast = placementReasons(p, r.fastest, { horizon: 2 });
    expect(fast.cr30.kind).toBe("kept");
    expect(fast.cr30.text).toMatch(/^Kept in 2026: /);
  });

  it("gives a running annual-max balance that never goes up within a plan year", () => {
    const lines = [...r.fastest.lines].sort((a, b) => (a.date < b.date ? -1 : 1));
    const fast = placementReasons(p, r.fastest, { horizon: 2 });
    let prev = Infinity;
    for (const l of lines) {
      const left = fast[l.id].maxLeftAfter;
      expect(left).toBeDefined();
      expect(left).toBeLessThanOrEqual(prev);
      prev = left ?? prev;
    }
  });

  it("waits for a frequency limit, naming the date and the last one", () => {
    // Panoramic X-rays: 1 per 60 months, last one Nov 20, 2021, so the next covered one is Nov 20, 2026.
    const q = profileOf([proc("pano", "D0330", { fee: 150, allowedFee: 120 })], "2026-10-05");
    q.ledger.history = [{ date: "2021-11-20", cdt: "D0330", planPaid: 60, inNetwork: true, source: "claim" }];
    const plan = optimize(q, { horizon: 2 }).fastest;
    expect(plan.placements[0].date).toBe("2026-11-20");
    const reason = placementReasons(q, plan, { horizon: 2 }).pano;
    expect(reason.kind).toBe("frequency");
    expect(reason.text).toContain("Not before Nov 20, 2026");
    expect(reason.text).toContain("your last one was Nov 20, 2021");
  });
});

describe("deductible wording", () => {
  it("names the classes the plan's deductible applies to", () => {
    const p = profileOf([proc("rc", "D3330", { tooth: 19 })], "2026-10-05");
    const line = optimize(p, { horizon: 2 }).fastest.lines[0];
    const text = (rules: typeof ACME_LOW) => explainLine(line, rules).find((s) => s.key === "deductible")?.text;
    expect(line.deductibleApplied).toBeGreaterThan(0);
    const applies = ACME_LOW.deductible.appliesTo;
    expect(text(ACME_LOW)).toContain(applies.join(" and ").replace("preventive and ", "preventive, "));
    expect(text({ ...ACME_LOW, deductible: { ...ACME_LOW.deductible, appliesTo: ["major"] } })).toContain("2026 major care");
    expect(text({ ...ACME_LOW, deductible: { ...ACME_LOW.deductible, appliesTo: ["preventive", "basic", "major"] } })).toContain("preventive, basic and major care");
  });
});
