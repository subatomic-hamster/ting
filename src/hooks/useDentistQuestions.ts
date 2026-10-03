import { useActive } from '../store';

export const GENERAL_QUESTIONS = [
  'Is there an equally good option that costs less?',
  'Will you send a pre-treatment estimate to my insurer first?',
];

/** The engine's question for every delay in the schedule, then the general ones. */
export function useDentistQuestions(limit?: number): string[] {
  const all = [...useActive().questions, ...GENERAL_QUESTIONS];
  return limit ? all.slice(0, limit) : all;
}
