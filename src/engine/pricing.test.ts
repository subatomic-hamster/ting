import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "../data/demo";
import { toProcedures } from "../intake/questions";
import { parseDescription } from "../intake/describe";
import { adjudicate, planYearsFor } from "./adjudicate";
import { outOfNetworkAllowance } from "./cdt";
import { explainLine } from "./explain";
import { priceDentists } from "./helpers";
import type { FeeTable, Profile } from "./types";

const fees: FeeTable = {
  D2740: {
    billed: 1500,
    inNetwork: 900,
    ucr: { 80: 1300 },
    mac: 750,
    source: { kind: "benchmark", label: "Test benchmark", zip: "27401" },
  },
};
const profile = (inNetwork = false): Profile => ({
  ...DEMO_PROFILE,
  fees,
  ledger: {
    ...DEMO_PROFILE.ledger,
    maxUsed: 0,
    deductibleMet: 50,
    rolloverBalance: 0,
    history: [],
  },
  procedures: [{ id: "crown", cdt: "D2740", fee: 1500, inNetwork }],
});
const price = (p: Profile) =>
  adjudicate(p, planYearsFor(p), [{ id: "crown", date: p.asOf }]).lines[0];

describe("fee benchmarks and insurer allowances", () => {
  it("actual quote provenance alone prevents a demo allowance fallback", () => {
    const p = profile(true);
    p.procedures[0].feeSource = { kind: "quote", label: "Dentist fee" };
    expect(price(p).memberOwes).toBe(1500);
    expect(price(p).planPaid).toBe(0);
  });

  it("looks up the exact percentile, independent of the billed amount", () => {
    expect(
      outOfNetworkAllowance("D2740", { basis: "ucr", percentile: 80 }, fees),
    ).toBe(1300);
    expect(
      outOfNetworkAllowance(
        "D2740",
        { basis: "ucr", percentile: 80 },
        { D2740: { ...fees.D2740, billed: 6000 } },
      ),
    ).toBe(1300);
    expect(
      outOfNetworkAllowance("D2740", { basis: "ucr", percentile: 90 }, fees),
    ).toBeUndefined();
  });
  it("does not treat an in-network estimate as a MAC schedule", () => {
    expect(outOfNetworkAllowance("D2740", { basis: "mac" }, fees)).toBe(750);
    expect(
      outOfNetworkAllowance(
        "D2740",
        { basis: "mac" },
        { D2740: { billed: 1500, inNetwork: 900 } },
      ),
    ).toBeUndefined();
  });
  it("applies coinsurance to the allowance, keeping the balance bill separate", () => {
    const l = price(profile());
    expect(l).toMatchObject({
      allowed: 1300,
      planPaid: 650,
      balanceBill: 200,
      memberOwes: 850,
    });
  });
  it("caps the benefit at an actual quote below the benchmark", () => {
    const p = profile();
    p.procedures[0].fee = 1000;
    expect(price(p)).toMatchObject({
      allowed: 1000,
      planPaid: 500,
      balanceBill: 0,
      memberOwes: 500,
    });
  });
  it.each([true, false])(
    "budgets the full fee when allowance is missing (inNetwork=%s), without a denial or deductible/max use",
    (inNetwork) => {
      const p = profile(inNetwork);
      p.fees = { D2740: { billed: 1500 } };
      p.ledger.deductibleMet = 0;
      const result = adjudicate(p, planYearsFor(p), [
        { id: "crown", date: p.asOf },
      ]);
      const l = result.lines[0];
      expect(l).toMatchObject({
        planPaid: 0,
        memberOwes: 1500,
        deductibleApplied: 0,
      });
      expect(l.denied).toBeUndefined();
      expect(l.pricingWarning).toContain("not a coverage denial");
      expect(result.years[0]).toMatchObject({ maxUsed: 0, deductibleMet: 0 });
      expect(explainLine(l).at(-1)?.text).toContain(
        "until the insurer allowance is confirmed",
      );
    },
  );
  it("respects a confirmed allowance even when benchmarks are unavailable", () => {
    const p = profile();
    p.fees = {};
    p.procedures[0].allowedFee = 1200;
    p.procedures[0].allowedFeeSource = {
      kind: "contract",
      label: "Insurer pretreatment estimate",
    };
    expect(price(p)).toMatchObject({
      planPaid: 600,
      memberOwes: 900,
      allowanceSource: { kind: "contract" },
    });
    expect(price(p).pricingWarning).toBeUndefined();
  });
  it("does not reuse a confirmed allowance for another plan or network", () => {
    const p = profile(true);
    p.procedures[0].allowedFee = 1200;
    p.procedures[0].allowedFeeSource = {
      kind: "contract",
      label: "Confirmed",
      planId: p.currentPlan.id,
      planVersion: p.currentPlan.version,
      network: "in",
    };
    expect(price(p).planPaid).toBeGreaterThan(0);
    p.currentPlan = { ...p.currentPlan, id: "different-plan" };
    expect(price(p)).toMatchObject({
      memberOwes: 1500,
      planPaid: 0,
      allowanceSource: undefined,
    });
    p.currentPlan = { ...p.currentPlan, id: DEMO_PROFILE.currentPlan.id };
    p.procedures[0].inNetwork = false;
    expect(price(p).memberOwes).toBe(1500);
  });
  it("keeps a missing in-network allowance missing in dentist comparisons", () => {
    const p = profile();
    p.fees = { D2740: { billed: 1500 } };
    const [quote] = priceDentists(
      p,
      [{ id: "crown", date: p.asOf }],
      [{ id: "dentist", inNetwork: true, feeMultiplier: 1 }],
    );
    expect(quote.inNetworkCost).toBe(1500);
    expect(quote.outOfNetworkCost).toBe(1500);
  });
  it("does not assume an alternate-benefit allowance when its code is missing", () => {
    const p = profile(true);
    p.procedures = [
      { id: "crown", cdt: "D2392", tooth: 30, fee: 300, inNetwork: true },
    ];
    p.fees = { D2392: { billed: 300, inNetwork: 200 } };
    expect(price(p).pricingWarning).toContain(
      "Alternate-benefit allowance unavailable",
    );
    expect(price(p).planPaid).toBe(0);
  });
  it("keeps treatment-plan quoted fees distinct from synthetic allowances", () => {
    const items = parseDescription("crown");
    items[0].fee = 1800;
    const proc = toProcedures(items, DEMO_PROFILE)[0];
    expect(proc).toMatchObject({
      fee: 1800,
      feeSource: { kind: "quote" },
      allowedFeeSource: undefined,
      allowancePending: true,
    });
  });
  it("does not use a synthetic allowance for a real quote with unknown coverage", () => {
    const p = profile(true);
    p.procedures[0].allowancePending = true;
    expect(price(p)).toMatchObject({ memberOwes: 1500, planPaid: 0 });
    expect(price(p).pricingWarning).toContain("Insurer allowance");
  });
  it("never substitutes a synthetic alternate-benefit rate for an actual filling quote", () => {
    const p = profile(true);
    p.fees = DEMO_PROFILE.fees;
    p.procedures = [
      {
        id: "crown",
        cdt: "D2392",
        tooth: 30,
        fee: 300,
        feeSource: { kind: "quote", label: "Actual quote" },
        allowedFee: 250,
        inNetwork: true,
      },
    ];
    expect(price(p).pricingWarning).toContain("Alternate-benefit allowance");
    expect(price(p).planPaid).toBe(0);
    p.procedures[0].alternateAllowedFee = 180;
    expect(price(p).pricingWarning).toBeUndefined();
    expect(price(p).benefitBase).toBe(180);
  });
  it("budgets an unknown replacement date without inventing a frequency denial", () => {
    const p = profile(true);
    p.procedures[0].historyPending = true;
    expect(price(p)).toMatchObject({ memberOwes: 1500, planPaid: 0 });
    expect(price(p).pricingWarning).toContain("Previous crown date unknown");
    expect(price(p).denied).toBeUndefined();
  });
});
