import { useMemo } from 'react';
import { priceDentists, type DentistQuote } from '../engine';
import dentistsJson from '../fixtures/dentists.json';
import { useEngineInput } from '../store';

export interface Dentist {
  id: string;
  name: string;
  neighborhood: string;
  distanceMiles: number;
  inNetwork: boolean;
  feeMultiplier: number;
  acceptingNew: boolean;
}

export const DENTISTS: Dentist[] = dentistsJson.dentists;

/** Every dentist priced by the engine for the current treatment plan. */
export function useDentistQuotes(): Map<string, DentistQuote> {
  const input = useEngineInput();
  return useMemo(() => new Map(priceDentists(input, DENTISTS).map((q) => [q.dentistId, q])), [input]);
}
