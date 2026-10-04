import additionalCodes from "../data/procedure-catalog.json";
import demoFees from "../data/demo-fees.json";
import type { CdtCategory, FeeEntry, FeeTable, OutOfNetworkBasis } from "./types";

export interface CdtInfo {
  description: string;
  short: string;
  category: CdtCategory;
  /** Crowns and bridges: the carrier becomes liable on the preparation date, not the seat date. */
  prepDated?: boolean;
  /** Back-tooth composite → the amalgam code the alternate benefit pays at. */
  amalgamEquivalent?: string;
}

// Common procedures with independent plain-language names. Confirm the billing code with the dentist.
export const CDT: Record<string, CdtInfo> = {
  ...(additionalCodes as Record<string, CdtInfo>),
  D0120: {
    short: "Checkup exam",
    description: "Periodic oral evaluation",
    category: "diagnostic",
  },
  D0140: {
    short: "Problem exam",
    description: "Limited oral evaluation, problem focused",
    category: "diagnostic",
  },
  D0150: {
    short: "New-patient exam",
    description: "Comprehensive oral evaluation",
    category: "diagnostic",
  },
  D0210: {
    short: "Full-mouth X-rays",
    description: "Intraoral complete series of radiographic images",
    category: "diagnostic",
  },
  D0220: {
    short: "Single X-ray",
    description: "Intraoral periapical, first radiographic image",
    category: "diagnostic",
  },
  D0274: {
    short: "Bitewing X-rays",
    description: "Bitewings, four radiographic images",
    category: "diagnostic",
  },
  D0330: {
    short: "Panoramic X-ray",
    description: "Panoramic radiographic image",
    category: "diagnostic",
  },
  D1110: {
    short: "Cleaning",
    description: "Prophylaxis, adult",
    category: "preventive",
  },
  D1120: {
    short: "Child cleaning",
    description: "Prophylaxis, child",
    category: "preventive",
  },
  D1206: {
    short: "Fluoride varnish",
    description: "Topical application of fluoride varnish",
    category: "preventive",
  },
  D1351: {
    short: "Sealant",
    description: "Sealant, per tooth",
    category: "preventive",
  },
  D2140: {
    short: "Silver filling (1 surface)",
    description: "Amalgam, one surface",
    category: "restorative",
  },
  D2150: {
    short: "Silver filling (2 surfaces)",
    description: "Amalgam, two surfaces",
    category: "restorative",
  },
  D2160: {
    short: "Silver filling (3 surfaces)",
    description: "Amalgam, three surfaces",
    category: "restorative",
  },
  D2161: {
    short: "Silver filling (4+ surfaces)",
    description: "Amalgam, four or more surfaces",
    category: "restorative",
  },
  D2330: {
    short: "Front tooth filling",
    description: "Resin-based composite, one surface, anterior",
    category: "restorative",
  },
  D2391: {
    short: "Tooth-colored filling (1 surface)",
    description: "Resin-based composite, one surface, posterior",
    category: "restorative",
    amalgamEquivalent: "D2140",
  },
  D2392: {
    short: "Tooth-colored filling (2 surfaces)",
    description: "Resin-based composite, two surfaces, posterior",
    category: "restorative",
    amalgamEquivalent: "D2150",
  },
  D2393: {
    short: "Tooth-colored filling (3 surfaces)",
    description: "Resin-based composite, three surfaces, posterior",
    category: "restorative",
    amalgamEquivalent: "D2160",
  },
  D2394: {
    short: "Tooth-colored filling (4+ surfaces)",
    description: "Resin-based composite, four or more surfaces, posterior",
    category: "restorative",
    amalgamEquivalent: "D2161",
  },
  D2740: {
    short: "Crown (porcelain)",
    description: "Crown, porcelain/ceramic",
    category: "majorRestorative",
    prepDated: true,
  },
  D2750: {
    short: "Crown (porcelain on metal)",
    description: "Crown, porcelain fused to high noble metal",
    category: "majorRestorative",
    prepDated: true,
  },
  D2790: {
    short: "Crown (gold)",
    description: "Crown, full cast high noble metal",
    category: "majorRestorative",
    prepDated: true,
  },
  D2920: {
    short: "Re-cement crown",
    description: "Re-cement or re-bond crown",
    category: "restorative",
  },
  D2950: {
    short: "Core buildup",
    description: "Core buildup, including any pins when required",
    category: "majorRestorative",
  },
  D2954: {
    short: "Post and core",
    description: "Prefabricated post and core in addition to crown",
    category: "majorRestorative",
  },
  D3220: {
    short: "Pulpotomy",
    description: "Therapeutic pulpotomy",
    category: "endodontics",
  },
  D3310: {
    short: "Root canal (front tooth)",
    description: "Endodontic therapy, anterior tooth",
    category: "endodontics",
  },
  D3320: {
    short: "Root canal (premolar)",
    description: "Endodontic therapy, premolar tooth",
    category: "endodontics",
  },
  D3330: {
    short: "Root canal (molar)",
    description: "Endodontic therapy, molar tooth",
    category: "endodontics",
  },
  D4341: {
    short: "Deep cleaning (per quadrant)",
    description:
      "Periodontal scaling and root planing, four or more teeth per quadrant",
    category: "periodontics",
  },
  D4342: {
    short: "Deep cleaning (1-3 teeth)",
    description:
      "Periodontal scaling and root planing, one to three teeth per quadrant",
    category: "periodontics",
  },
  D4355: {
    short: "Full-mouth debridement",
    description: "Full mouth debridement",
    category: "periodontics",
  },
  D4910: {
    short: "Gum maintenance cleaning",
    description: "Periodontal maintenance",
    category: "periodontics",
  },
  D5110: {
    short: "Full upper denture",
    description: "Complete denture, maxillary",
    category: "prosthodontics",
  },
  D5213: {
    short: "Partial denture",
    description: "Maxillary partial denture, cast metal framework",
    category: "prosthodontics",
  },
  D6010: {
    short: "Implant",
    description: "Surgical placement of implant body, endosteal",
    category: "implants",
  },
  D6065: {
    short: "Implant crown",
    description: "Implant supported porcelain/ceramic crown",
    category: "implants",
    prepDated: true,
  },
  D6240: {
    short: "Bridge tooth (pontic)",
    description: "Pontic, porcelain fused to high noble metal",
    category: "prosthodontics",
    prepDated: true,
  },
  D6750: {
    short: "Bridge crown",
    description: "Retainer crown, porcelain fused to high noble metal",
    category: "prosthodontics",
    prepDated: true,
  },
  D7140: {
    short: "Extraction",
    description: "Extraction, erupted tooth",
    category: "oralSurgery",
  },
  D7210: {
    short: "Surgical extraction",
    description: "Extraction, erupted tooth requiring bone removal",
    category: "oralSurgery",
  },
  D7240: {
    short: "Wisdom tooth removal (bony)",
    description: "Removal of impacted tooth, completely bony",
    category: "oralSurgery",
  },
  D8080: {
    short: "Braces (teen)",
    description:
      "Comprehensive orthodontic treatment of the adolescent dentition",
    category: "orthodontics",
  },
  D8090: {
    short: "Braces (adult)",
    description: "Comprehensive orthodontic treatment of the adult dentition",
    category: "orthodontics",
  },
  D9110: {
    short: "Emergency pain relief",
    description: "Palliative treatment of dental pain",
    category: "adjunctive",
  },
  D9230: {
    short: "Laughing gas",
    description: "Inhalation of nitrous oxide",
    category: "adjunctive",
  },
  D9239: {
    short: "IV sedation (first 15 min)",
    description: "Intravenous moderate sedation, first 15 minutes",
    category: "adjunctive",
  },
  D9243: {
    short: "IV sedation (each extra 15 min)",
    description: "Intravenous moderate sedation, each subsequent 15 minutes",
    category: "adjunctive",
  },
  D9944: {
    short: "Night guard",
    description: "Occlusal guard, hard appliance, full arch",
    category: "adjunctive",
  },
};

/**
 * Sample-account fees for ZIP 27401. Codes on NC Medicaid's published dental fee schedule (effective Feb 10, 2022) are
 * estimated from it: billed ≈ rate ÷ Medicaid's share of dentist charges, in-network ≈ rate ÷ its share of private
 * allowed amounts (ADA Health Policy Institute, North Carolina, 2024: adults 36.3% / 54.8%, children 34.3% / 52.8%), with
 * charge percentiles spread around the median (90th ≈ 1.25×). Codes Medicaid doesn't list keep synthetic sample fees.
 * Estimates, not quotes or contracted rates: see docs/dental-pricing-and-plan-designs.md.
 */
export const DEMO_FEES: FeeTable = Object.fromEntries(
  Object.entries(demoFees as Record<string, FeeEntry>).map(([code, fee]) => [
    code,
    {
      ...fee,
      source: fee.source ?? { kind: "demo", label: "Sample fee: not on NC Medicaid's schedule", zip: "27401" },
    },
  ]),
);

/** Exact lookup only: percentiles cannot be derived by scaling the dentist's billed fee. */
export function outOfNetworkAllowance(
  cdt: string,
  basis: OutOfNetworkBasis,
  fees: FeeTable,
): number | undefined {
  const fee = fees[cdt];
  if (!fee) return undefined;
  // In-network fees are not necessarily the plan's MAC schedule.
  return basis.basis === "mac" ? fee.mac : fee.ucr?.[basis.percentile];
}

const MOLARS = new Set([1, 2, 3, 14, 15, 16, 17, 18, 19, 30, 31, 32]);
const PREMOLARS = new Set([4, 5, 12, 13, 20, 21, 28, 29]);

export const isMolar = (tooth?: number) =>
  tooth !== undefined && MOLARS.has(tooth);
export const isPosterior = (tooth?: number) =>
  tooth !== undefined && (MOLARS.has(tooth) || PREMOLARS.has(tooth));

/** A procedure's name for people: its own label if it has one, and its tooth only when someone said which tooth. */
export function nameOf(x: {
  cdt: string;
  tooth?: number;
  toothGuessed?: boolean;
  label?: string;
}): string {
  const tooth = x.toothGuessed ? undefined : x.tooth;
  return x.label
    ? `${x.label}${tooth ? ` on #${tooth}` : ""}`
    : cdtLabel(x.cdt, tooth);
}

export function cdtLabel(cdt: string, tooth?: number): string {
  const name = CDT[cdt]?.short ?? cdt;
  return tooth ? `${name} on #${tooth}` : name;
}
