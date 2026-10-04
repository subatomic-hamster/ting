import { expect, test } from "vitest";
import { ACME_LOW } from "../data/demo";
import { serviceCoverage } from "./coverage";
test("common-service percentages follow the plan mapping rather than a fixed basic-care assumption", () => {
  const rules = { ...ACME_LOW, categoryClass: { ...ACME_LOW.categoryClass, restorative: "major" as const } };
  expect(serviceCoverage(rules, "D2392").inNetwork).toBe(0.5);
  expect(serviceCoverage(rules, "D2392").deductibleApplies).toBe(true);
});
test("cleanings retain their actual limit and excluded services show no benefit", () => {
  expect(serviceCoverage(ACME_LOW, "D1110").limits[0].count).toBe(2);
  expect(serviceCoverage(ACME_LOW, "D1110").inNetwork).toBe(1);
  expect(serviceCoverage(ACME_LOW, "D8090").inNetwork).toBe(0);
  expect(serviceCoverage(ACME_LOW, "D8090").outOfNetwork).toBe(0);
});
test("unknown procedures and waived coverage cannot borrow insurance percentages", () => {
  expect(serviceCoverage(ACME_LOW, "D9999").inNetwork).toBe(0);
  expect(serviceCoverage({ ...ACME_LOW, kind: "waive" }, "D1110").inNetwork).toBe(0);
});
