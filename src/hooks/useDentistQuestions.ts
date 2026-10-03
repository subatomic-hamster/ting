import { useResult } from '../store';

export const GENERAL_QUESTIONS = [
  'Is there an equally good option that costs less?',
  'Will you send a pre-treatment estimate to my insurer first?',
];

export function useDentistQuestions(limit?: number): string[] {
  const result = useResult();
  const specific = result.activeSchedule.items.map((i) => i.dentistQuestion).filter((q): q is string => Boolean(q));
  const all = [...specific, ...GENERAL_QUESTIONS];
  return limit ? all.slice(0, limit) : all;
}
