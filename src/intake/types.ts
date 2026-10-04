// Every intake channel (typed, spoken, photographed, uploaded) ends up as the same IntakeItem.

export type IntakeSource = 'text' | 'voice' | 'photo' | 'upload';

export interface IntakeItem {
  id: string;
  source: IntakeSource;
  /** The text this item came from. */
  phrase: string;
  /** Sorted by p descending; p sums to at most 1. */
  candidates: { cdt: string; p: number }[];
  /** Sorted by p descending; empty when unknown or not needed. */
  teeth: { tooth: number; p: number }[];
  /** Dentist's billed fee, when the source states one. */
  fee?: number;
  /** P(replaces an existing crown); set only when the user mentions it. */
  replacement?: number;
  /** Top code p × top tooth p (1 when the code needs no tooth; 0 when it needs one and none is known). */
  confidence: number;
  /** Who set the probabilities: the built-in heuristics (default), Winnow, or Winnow's labelled simulation. */
  decidedBy?: 'winnow' | 'simulated';
  /** A "maybe" item: how likely the work is this year, read from the dentist's own wording. */
  likelihood?: number;
  likelihoodFrom?: 'notes';
}

export interface IntakeQuestion {
  itemId: string;
  field: 'cdt' | 'tooth' | 'replacement';
  prompt: string;
  /** "If it's X instead you'd pay $Y more/less"; every dollar comes from the engine. */
  why: string;
  options: { value: string; label: string; p: number; owes: number }[];
  preselected: string;
  expectedCostOfGuessing: number;
}
