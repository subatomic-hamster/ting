import { expect, test } from "vitest";
import {
  ACME_HIGH,
  ACME_LOW,
  DEMO_PROFILE,
  MEMBERSHIP,
  WAIVE,
} from "../data/demo";
import { compare } from "./compare";
import type { PlanRules } from "./types";

const noCare = { ...DEMO_PROFILE, procedures: [] };
test("moving preference changes the choice while preserving exact costs and the cheapest option", () => {
  const plans = [WAIVE, MEMBERSHIP, ACME_LOW, ACME_HIGH];
  const ordinary = compare(noCare, plans);
  const moving = compare(
    { ...noCare, preferences: { movesFrequently: true } },
    plans,
  );
  expect(ordinary.best.plan.id).toBe("waive");
  expect(moving.best.plan.id).toBe("acme-high");
  expect(moving.lowestCost.plan.id).toBe("waive");
  expect(moving.options.map((o) => o.total)).toEqual(
    ordinary.options.map((o) => o.total),
  );
  expect(moving.card.choice).toBe(moving.best);
  expect(moving.portability?.reason).toContain("balance billing");
});
test("a plan with zero out-of-network benefits is never the moving recommendation", () => {
  const closed: PlanRules = {
    ...ACME_HIGH,
    id: "closed",
    coinsurance: {
      ...ACME_HIGH.coinsurance,
      outOfNetwork: { preventive: 0, basic: 0, major: 0, ortho: 0 },
    },
  };
  const c = compare({ ...noCare, preferences: { movesFrequently: true } }, [
    closed,
    ACME_LOW,
  ]);
  expect(c.best.plan.id).toBe("acme-low");
});
test("no eligible out-of-network option gives an explicit unavailable result", () => {
  const c = compare({ ...noCare, preferences: { movesFrequently: true } }, [
    WAIVE,
    MEMBERSHIP,
  ]);
  expect(c.portability).toBeUndefined();
  expect(c.best).toBe(c.lowestCost);
  expect(c.insights.find((i) => i.id === "mobility")?.text).toContain(
    "None of these options",
  );
});
test("an excluded procedure cannot borrow the coinsurance of another class", () => {
  const profile = {
    ...DEMO_PROFILE,
    preferences: { movesFrequently: true },
    procedures: [{ id: "braces", cdt: "D8090", fee: 5000, inNetwork: true }],
  };
  expect(
    compare(profile, [ACME_LOW, ACME_HIGH]).portability?.option.plan.id,
  ).toBe("acme-high");
});
test("MAC and UCR bases are not ranked by an invented allowance amount", () => {
  const mac: PlanRules = {
    ...ACME_LOW,
    id: "mac",
    premiumMonthly: 1,
    outOfNetwork: { basis: "mac" },
  };
  const c = compare({ ...noCare, preferences: { movesFrequently: true } }, [
    mac,
    ACME_HIGH,
  ]);
  expect(c.best.plan.id).toBe("mac");
});
test("no or unknown moving answers leave the cost recommendation intact", () => {
  for (const movesFrequently of [false, undefined]) {
    const c = compare({ ...noCare, preferences: { movesFrequently } }, [
      WAIVE,
      ACME_HIGH,
    ]);
    expect(c.best).toBe(c.lowestCost);
    expect(c.portability).toBeUndefined();
  }
});
test("mixed MAC and UCR options have an order-independent coverage priority", () => {
  const mac: PlanRules = { ...ACME_LOW, id: "mac", premiumMonthly: 36, outOfNetwork: { basis: "mac" } };
  const profile = { ...noCare, preferences: { movesFrequently: true } };
  for (const plans of [[ACME_LOW, ACME_HIGH, mac], [mac, ACME_LOW, ACME_HIGH], [ACME_HIGH, mac, ACME_LOW]]) {
    const c = compare(profile, plans);
    expect(c.best.plan.id).toBe("mac");
    expect(c.lowestCost.plan.id).toBe("acme-low");
  }
});
