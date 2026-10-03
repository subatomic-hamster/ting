import { useMemo } from 'react';
import { priceDentists, type DentistQuote } from '../engine/helpers';
import dentistsJson from '../fixtures/dentists.json';
import { HORIZON, useActive, useProfile } from '../store';

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
export const FEE_ZIP = dentistsJson.zip;

/** Every dentist priced by the engine for the current schedule. */
export function useDentistQuotes(): Map<string, DentistQuote> {
  const profile = useProfile();
  const { placements } = useActive();
  return useMemo(
    () => new Map(priceDentists(profile, placements, DENTISTS, { horizon: HORIZON }).map((q) => [q.dentistId, q])),
    [profile, placements],
  );
}
