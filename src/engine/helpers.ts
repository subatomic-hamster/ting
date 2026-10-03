// Engine-side helpers that build on runEngine. They work with any engine that
// honours the contract, so they stay when the placeholder is replaced.
// UI code must use these instead of doing arithmetic on amounts.

import type { EngineInput, EngineResult } from '../contracts';
// Imported through the seam so these helpers follow whichever engine index.ts exports.
import { runEngine } from './index';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Change in what the member pays between two results (positive = costs more). */
export function memberTotalDelta(before: EngineResult, after: EngineResult): number {
  return round2(after.activeSchedule.memberTotal - before.activeSchedule.memberTotal);
}

export interface DentistQuote {
  dentistId: string;
  /** What you'd pay for the active schedule if this dentist's fees were billed in-network. */
  inNetworkCost: number;
  /** What you'd pay if they are out of network (includes balance billing). */
  outOfNetworkCost: number;
  /** Extra cost of going out of network, mostly balance billing. */
  outOfNetworkExtra: number;
  /** Cost given the dentist's actual network status. */
  yourCost: number;
}

export function priceDentists(
  input: EngineInput,
  dentists: { id: string; inNetwork: boolean; feeMultiplier: number }[],
): DentistQuote[] {
  return dentists.map((d) => {
    const m = d.feeMultiplier;
    const procedures = input.procedures.map((p) => ({
      ...p,
      feeIn: round2(p.feeIn * m),
      feeOut: round2(p.feeOut * m),
      feeRange: p.feeRange ? ([round2(p.feeRange[0] * m), round2(p.feeRange[1] * m)] as [number, number]) : undefined,
    }));
    const inCost = runEngine({ ...input, procedures, network: 'in' }).activeSchedule.memberTotal;
    const outCost = runEngine({ ...input, procedures, network: 'out' }).activeSchedule.memberTotal;
    return {
      dentistId: d.id,
      inNetworkCost: inCost,
      outOfNetworkCost: outCost,
      outOfNetworkExtra: round2(outCost - inCost),
      yourCost: d.inNetwork ? inCost : outCost,
    };
  });
}
