import { describe, expect, it } from "vitest";
import { ACME_HIGH, ACME_LOW, DEMO_PROFILE } from "../data/demo";
import { evaluateSchedule, optimize, validatePlacements } from "./schedule";
import type { Ledger, PlannedProcedure, PlanRules, Profile } from "./types";

// Hand-calculated cases from the sample Acme plans (src/data/demo.ts).
// Low: $1,500 max, $50 deductible on basic/major, 100/80/50, alternate benefit, MaxRewards 750 → 375 + 125.

const NO_FSA: Profile["money"] = {
  fsaOffered: false,
  fsaBalance: 0,
  fsaRule: { kind: "none" },
  marginalTaxRate: 0,
};

function profile(
  procedures: PlannedProcedure[],
  ledger: Partial<Ledger> = {},
  plan: PlanRules = ACME_LOW,
): Profile {
  return {
    ...DEMO_PROFILE,
    currentPlan: plan,
    procedures,
    ledger: { ...DEMO_PROFILE.ledger, ...ledger },
    money: NO_FSA,
  };
}

const rc = (
  id: string,
  tooth: number,
  extra: Partial<PlannedProcedure> = {},
): PlannedProcedure => ({
  id,
  cdt: "D3330",
  tooth,
  fee: 1180,
  allowedFee: 1000,
  inNetwork: true,
  ...extra,
});
const crown = (
  id: string,
  tooth: number,
  extra: Partial<PlannedProcedure> = {},
): PlannedProcedure => ({
  id,
  cdt: "D2740",
  tooth,
  fee: 1450,
  allowedFee: 1200,
  inNetwork: true,
  ...extra,
});

const at = (p: Profile, dates: Record<string, string>, nextPlan?: PlanRules) =>
  evaluateSchedule(
    p,
    Object.entries(dates).map(([id, date]) => ({ id, date })),
    { nextPlan },
  );
function lineOf(ev: ReturnType<typeof at>, id: string) {
  const line = ev.lines.find((l) => l.id === id);
  if (!line) throw new Error(`no line ${id}`);
  return line;
}

const WORKED = [
  rc("rc19", 19, { locked: true, deadline: "2026-11-15" }),
  {
    id: "bu19",
    cdt: "D2950",
    tooth: 19,
    fee: 330,
    allowedFee: 250,
    inNetwork: true,
    dependsOn: ["rc19"],
    deadline: "2027-03-31",
  },
  crown("cr19", 19, { dependsOn: ["bu19"], deadline: "2027-03-31" }),
  crown("cr30", 30, { deadline: "2027-03-31" }),
];

describe("worked example: root canal, buildup, two crowns in October", () => {
  const p = profile(WORKED);

  it("1. doing everything now costs $2,450 (max runs out)", () => {
    const ev = at(p, {
      rc19: "2026-10-05",
      bu19: "2026-10-12",
      cr19: "2026-10-19",
      cr30: "2026-10-05",
    });
    expect(ev.expectedOwes).toBe(2450);
    expect(lineOf(ev, "cr30").capReduction).toBe(200); // $600 share, $400 of max left
  });

  it("2. moving both crowns to January costs $1,550, saving $900", () => {
    const ev = at(p, {
      rc19: "2026-10-05",
      bu19: "2026-10-12",
      cr19: "2027-01-04",
      cr30: "2027-01-04",
    });
    expect(ev.expectedOwes).toBe(1550);
    expect(lineOf(ev, "cr19").deductibleApplied).toBe(50); // new year, new deductible
    expect(lineOf(ev, "cr19").memberOwes).toBe(625);
  });

  it("3. optimizer finds the $1,550 schedule, keeps the locked root canal, asks the dentist about each delay", () => {
    const r = optimize(p);
    expect(r.fastest.expectedOwes).toBe(2450);
    expect(r.cheapest.expectedOwes).toBe(1550);
    expect(r.cheapest.placements.find((x) => x.id === "rc19")?.date).toBe(
      "2026-10-05",
    );
    expect(r.cheapest.placements.find((x) => x.id === "cr19")?.date).toBe(
      "2027-01-04",
    );
    expect(r.cheapest.questions).toEqual([
      "Can the crown (porcelain) on #19 safely wait until Jan 4, 2027?",
      "Can the crown (porcelain) on #30 safely wait until Jan 4, 2027?",
    ]);
    expect(validatePlacements(p, r.cheapest.placements)).toEqual([]);
  });
});

describe("one visit: procedures that share a visit get one date", () => {
  const withVisit = (ids: string[]) =>
    profile(
      WORKED.map((x) => (ids.includes(x.id) ? { ...x, visit: "v1" } : x)),
    );

  it("both crowns in one appointment: the earlier one waits for the later one, never split across years", () => {
    const p = withVisit(["cr19", "cr30"]);
    const r = optimize(p);
    for (const ev of r.frontier) {
      const at = new Map(ev.placements.map((x) => [x.id, x.date]));
      expect(at.get("cr30")).toBe(at.get("cr19"));
    }
    // Alone, cr30 could go on Oct 5; with cr19 (after the root canal and buildup) the visit is Oct 19.
    expect(r.fastest.placements.find((x) => x.id === "cr30")?.date).toBe(
      "2026-10-19",
    );
    expect(validatePlacements(p, r.cheapest.placements)).toEqual([]);
  });

  it("a split visit is a safety violation", () => {
    const p = withVisit(["cr19", "cr30"]);
    const v = validatePlacements(p, [
      { id: "rc19", date: "2026-10-05" },
      { id: "bu19", date: "2026-10-12" },
      { id: "cr19", date: "2026-10-19" },
      { id: "cr30", date: "2027-01-04" },
    ]);
    expect(v.map((x) => x.message)).toContain(
      "Crown (porcelain) on #30 is done in the same visit as Crown (porcelain) on #19.",
    );
  });

  it("an urgent member pins the whole visit", () => {
    const p = withVisit(["rc19", "cr30"]);
    for (const ev of optimize(p).frontier)
      expect(ev.placements.find((x) => x.id === "cr30")?.date).toBe(
        "2026-10-05",
      );
  });
});

describe("adjudicator rules", () => {
  it("4. frequency limit: a third cleaning in a calendar year is denied, January is covered", () => {
    const p = profile(
      [{ id: "c", cdt: "D1110", fee: 120, allowedFee: 85, inNetwork: true }],
      {
        history: [
          { date: "2026-04-10", cdt: "D1110", planPaid: 85, source: "claim" },
          { date: "2026-09-01", cdt: "D1110", planPaid: 85, source: "claim" },
        ],
      },
    );
    const denied = lineOf(at(p, { c: "2026-11-02" }), "c");
    expect(denied.denied?.reason).toBe("frequency");
    expect(denied.memberOwes).toBe(85);
    expect(lineOf(at(p, { c: "2027-01-04" }), "c").memberOwes).toBe(0);
  });

  it("5. waiting period: a new plan with a 12-month major wait pays nothing for a 2027 crown", () => {
    const waiting = {
      ...ACME_HIGH,
      waitingPeriodMonths: { ...ACME_HIGH.waitingPeriodMonths, major: 12 },
    };
    const p = profile([crown("cr", 30)]);
    const l = lineOf(at(p, { cr: "2027-03-01" }, waiting), "cr");
    expect(l.denied?.reason).toBe("waitingPeriod");
    expect(l.memberOwes).toBe(1200);
    // Staying on the same plan never restarts a waiting period.
    expect(
      lineOf(
        at(profile([crown("cr", 30)], {}, waiting), { cr: "2027-03-01" }),
        "cr",
      ).denied,
    ).toBeUndefined();
  });

  it("6. alternate benefit: a back-tooth composite is paid at the amalgam rate", () => {
    const p = profile([
      {
        id: "f",
        cdt: "D2393",
        tooth: 3,
        fee: 310,
        allowedFee: 215,
        inNetwork: true,
      },
    ]);
    const l = lineOf(at(p, { f: "2026-10-20" }), "f");
    expect(l.benefitBase).toBe(160); // D2160 in-network fee
    expect(l.planPaid).toBe(128); // 160 × 80%, deductible already met
    expect(l.memberOwes).toBe(87);
    // A front tooth gets no downgrade.
    const front = profile([
      {
        id: "f",
        cdt: "D2393",
        tooth: 8,
        fee: 310,
        allowedFee: 215,
        inNetwork: true,
      },
    ]);
    expect(lineOf(at(front, { f: "2026-10-20" }), "f").planPaid).toBe(172);
  });

  it("7. max cap: plan pays only what is left of the annual max", () => {
    const l = lineOf(
      at(profile([crown("cr", 30)], { maxUsed: 1300 }), { cr: "2026-10-20" }),
      "cr",
    );
    expect(l.planShare).toBe(600);
    expect(l.planPaid).toBe(200);
    expect(l.memberOwes).toBe(1000);
    expect(l.waterfall.map((s) => s.key)).toEqual([
      "fee",
      "networkDiscount",
      "coinsurance",
      "maxCap",
      "youPay",
    ]);
    expect(l.waterfall.at(-2)?.running).toBe(1000);
  });

  it("8. out of network: plan pays on the 80th-percentile allowance, dentist balance-bills the rest", () => {
    const p = profile([
      { id: "r", cdt: "D3330", tooth: 19, fee: 1180, inNetwork: false },
    ]);
    const l = lineOf(at(p, { r: "2026-10-20" }), "r");
    expect(l.allowed).toBe(1145); // Explicit synthetic 80th-percentile fixture, not observed market data.
    expect(l.planPaid).toBe(916);
    expect(l.balanceBill).toBe(35);
    expect(l.memberOwes).toBe(264);
  });

  it("9. MaxRewards: a low-use year adds $500 to next year, deposited on day 65", () => {
    // 2026: $300 paid, all in network → 375 + 125 rollover lands 2027-03-06.
    const p = profile([crown("a", 2), crown("b", 3), crown("c", 14)]);
    const early = at(p, { a: "2027-01-04", b: "2027-01-11", c: "2027-02-01" });
    expect(lineOf(early, "c").planPaid).toBe(325); // 1500 − 575 − 600
    const late = at(p, { a: "2027-01-04", b: "2027-01-11", c: "2027-03-06" });
    expect(lineOf(late, "c").planPaid).toBe(600);
    expect(late.years[0].rolloverEarned).toBe(500);
  });

  it("10. Q4 deductible carryover: deductible paid in November covers next year", () => {
    const p = profile([rc("a", 19), rc("b", 3)], { deductibleMet: 0 });
    const ev = at(p, { a: "2026-11-02", b: "2027-01-04" });
    expect(lineOf(ev, "a").deductibleApplied).toBe(50);
    expect(lineOf(ev, "b").deductibleApplied).toBe(0);
    const noCarry = profile(
      [rc("a", 19), rc("b", 3)],
      { deductibleMet: 0 },
      { ...ACME_LOW, q4DeductibleCarryover: false },
    );
    expect(
      lineOf(at(noCarry, { a: "2026-11-02", b: "2027-01-04" }), "b")
        .deductibleApplied,
    ).toBe(50);
  });

  it("11. preventive care outside the max (High) is paid even when the max is gone", () => {
    const clean: PlannedProcedure = {
      id: "c",
      cdt: "D1110",
      fee: 120,
      allowedFee: 85,
      inNetwork: true,
    };
    expect(
      lineOf(
        at(profile([clean], { maxUsed: 2000 }, ACME_HIGH), { c: "2026-10-20" }),
        "c",
      ).memberOwes,
    ).toBe(0);
    expect(
      lineOf(at(profile([clean], { maxUsed: 1500 }), { c: "2026-10-20" }), "c")
        .memberOwes,
    ).toBe(85);
  });

  it("12. work in progress: a crown prepared Dec 28 counts in the old plan year", () => {
    const p = profile([crown("cr", 30)]);
    expect(
      lineOf(at(p, { cr: "2026-12-28" }, ACME_HIGH), "cr").rulesVersion,
    ).toBe("PLAN-ACME-LOW-v3");
    expect(
      lineOf(at(p, { cr: "2027-01-04" }, ACME_HIGH), "cr").rulesVersion,
    ).toBe("PLAN-ACME-HIGH-v3");
  });
});

describe("money", () => {
  it("13. current FSA balance is free to spend; next year is paid pre-tax", () => {
    const p = {
      ...profile([rc("r", 19)]),
      money: {
        ...NO_FSA,
        fsaOffered: true,
        fsaBalance: 100,
        marginalTaxRate: 0.3,
      },
    };
    const now = at(p, { r: "2026-10-20" });
    expect(now.years[0]).toMatchObject({
      owes: 200,
      fsaUsed: 100,
      pocket: 100,
      cost: 100,
    });
    const later = at(p, { r: "2027-01-04" });
    expect(later.years[1]).toMatchObject({
      owes: 240,
      fsaUsed: 240,
      pocket: 0,
      cost: 168,
    });
  });

  it('14. "maybe" work counts at its likelihood; the bad year counts all of it', () => {
    const ev = at(profile([rc("r", 3, { likelihood: 0.5 })]), {
      r: "2026-10-20",
    });
    expect(ev.expectedOwes).toBe(100);
    expect(ev.badYearCost).toBe(200);
  });
});

describe("safety rules", () => {
  it("15. flags past-deadline and out-of-order placements", () => {
    const p = profile(WORKED);
    const v = validatePlacements(p, [
      { id: "rc19", date: "2026-10-20" },
      { id: "bu19", date: "2026-10-10" },
      { id: "cr19", date: "2027-04-02" },
    ]);
    expect(v.map((x) => x.id).sort()).toEqual(["bu19", "cr19"]);
  });

  it("16. optimizer never schedules past a deadline and keeps locked work first", () => {
    const r = optimize(DEMO_PROFILE);
    for (const plan of [r.cheapest, r.fastest, r.balanced]) {
      expect(validatePlacements(DEMO_PROFILE, plan.placements)).toEqual([]);
      expect(plan.placements.find((x) => x.id === "rc19")?.date).toBe(
        DEMO_PROFILE.asOf,
      );
    }
    expect(r.cheapest.expectedCost).toBeLessThanOrEqual(
      r.balanced.expectedCost,
    );
    expect(r.balanced.expectedCost).toBeLessThanOrEqual(r.fastest.expectedCost);
  });

  it("17. re-pricing a dragged schedule takes well under 100 ms", () => {
    const placements = DEMO_PROFILE.procedures.map((p) => ({
      id: p.id,
      date: "2026-10-20",
    }));
    const t = performance.now();
    for (let i = 0; i < 10; i++) evaluateSchedule(DEMO_PROFILE, placements);
    expect((performance.now() - t) / 10).toBeLessThan(100);
  });
});
