import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "../data/demo";
import { parseDescription } from "./describe";
import { readFileSync } from "node:fs";
import { intakeQuestions, toProcedures } from "./questions";
import { parseTreatmentPlanText } from "./treatmentPlan";

describe("toProcedures", () => {
  it("prices the top answer from the fee table, in network, with stable ids", () => {
    const items = parseDescription("crown on tooth 19 and a deep cleaning");
    const procs = toProcedures(items, DEMO_PROFILE);
    expect(procs).toEqual([
      {
        id: items[0].id,
        cdt: "D2740",
        tooth: 19,
        fee: 1450,
        allowedFee: 1200,
        inNetwork: true,
        feeSource: DEMO_PROFILE.fees.D2740.source,
        allowedFeeSource: DEMO_PROFILE.fees.D2740.source,
      },
      {
        id: items[1].id,
        cdt: "D4341",
        tooth: undefined,
        fee: 290,
        allowedFee: 192,
        inNetwork: true,
        feeSource: DEMO_PROFILE.fees.D4341.source,
        allowedFeeSource: DEMO_PROFILE.fees.D4341.source,
      },
    ]);
    expect(
      toProcedures(
        parseDescription("crown on tooth 19 and a deep cleaning"),
        DEMO_PROFILE,
      ).map((p) => p.id),
    ).toEqual(procs.map((p) => p.id));
  });

  it("orders work on one tooth: root canal, then buildup, then crown", () => {
    const { items } = parseTreatmentPlanText(
      readFileSync(
        new URL("../../public/samples/treatment-plan.txt", import.meta.url),
        "utf8",
      ),
    );
    const procs = toProcedures(items, DEMO_PROFILE);
    const by = (cdt: string, tooth?: number) =>
      procs.find((p) => p.cdt === cdt && p.tooth === tooth);
    expect(by("D2950", 19)?.dependsOn).toEqual([by("D3330", 19)?.id]);
    expect(by("D2740", 19)?.dependsOn).toEqual([by("D2950", 19)?.id]);
    expect(by("D2740", 30)?.dependsOn).toBeUndefined();
  });

  it("uses the fee the document states", () => {
    const [item] = parseDescription("crown on tooth 19");
    expect(
      toProcedures([{ ...item, fee: 1300 }], DEMO_PROFILE)[0],
    ).toMatchObject({
      fee: 1300,
      allowedFee: undefined,
      allowancePending: true,
    });
  });
});

describe("intakeQuestions", () => {
  it("never invents a previous crown date to price replacement eligibility", () => {
    const items = parseDescription(
      "crown on a back tooth, I think it's replacing the old one",
    );
    expect(
      intakeQuestions(items, DEMO_PROFILE).filter(
        (q) => q.field === "replacement",
      ),
    ).toEqual([]);
  });

  it("does not ask which of #19 / #30 or which crown material when the bill is the same", () => {
    const items = parseDescription(
      "Crown on a lower back molar and a deep cleaning",
    );
    expect(items[0].teeth.map((t) => t.tooth)).toEqual([19, 30]);
    expect(intakeQuestions(items, DEMO_PROFILE)).toEqual([]);
  });

  it("asks which tooth when the teeth bill differently", () => {
    // Tooth #30 already has a crown on file from 2 years ago, #19 does not.
    const profile = {
      ...DEMO_PROFILE,
      ledger: {
        ...DEMO_PROFILE.ledger,
        history: [
          ...DEMO_PROFILE.ledger.history,
          {
            date: "2024-10-01",
            cdt: "D2740",
            tooth: 30,
            planPaid: 600,
            source: "claim" as const,
          },
        ],
      },
    };
    const [q] = intakeQuestions(
      parseDescription("crown on a lower back molar"),
      profile,
    );
    expect(q.field).toBe("tooth");
    expect(q.options.map((o) => [o.value, o.owes])).toEqual([
      ["19", 600],
      ["30", 1200],
    ]);
    expect(q.expectedCostOfGuessing).toBe(300);
    expect(q.why).toBe("If it's tooth #30 instead you'd pay $600 more.");
  });

  it("accepts an inferred code when the alternatives cost little in expectation", () => {
    // Root canal, no tooth words: molar owes $200, premolar $170, front $150 (80% after deductible).
    // Expected cost of guessing is about $15, under the $25 threshold.
    expect(
      intakeQuestions(parseDescription("root canal"), DEMO_PROFILE).filter(
        (q) => q.field === "cdt",
      ),
    ).toEqual([]);
  });
});
