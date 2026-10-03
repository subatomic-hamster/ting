import type { ProcedureItem, ServiceClass } from '../contracts';
import fees from './fees.json';

export interface FeeEntry {
  cdt: string;
  label: string;
  serviceClass: ServiceClass;
  feeIn: number;
  feeOut: number;
  feeRange: [number, number];
  keywords: string[];
}

export const FEE_SCHEDULE: FeeEntry[] = fees.procedures.map((p) => ({
  ...p,
  serviceClass: p.serviceClass as ServiceClass,
  feeRange: [p.feeRange[0], p.feeRange[1]] as [number, number],
}));

export const FEE_ZIP = fees.zip;

export function feeFor(cdt: string): FeeEntry | undefined {
  return FEE_SCHEDULE.find((f) => f.cdt === cdt);
}

/** Build a ProcedureItem from the demo fee schedule. Copies data only; no math. */
export function procedureFromCdt(
  cdt: string,
  fields: Partial<ProcedureItem> & Pick<ProcedureItem, 'id'>,
): ProcedureItem {
  const fee = feeFor(cdt);
  if (!fee) throw new Error(`Unknown CDT code in demo fee schedule: ${cdt}`);
  return {
    cdt,
    label: fee.label,
    serviceClass: fee.serviceClass,
    feeIn: fee.feeIn,
    feeOut: fee.feeOut,
    feeRange: fee.feeRange,
    locked: false,
    source: 'seed',
    confidence: 1,
    ...fields,
  };
}
