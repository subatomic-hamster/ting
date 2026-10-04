import type { TingApi } from '../api';
import type { AdjudicatedLine, PlanRules } from '../engine/types';

/** The plain-words explanation of one line: cached for the session (and on the server), so it's fetched once. */
export const explainQuery = (line: AdjudicatedLine, rules: PlanRules, client: Pick<TingApi, 'explain'>) => ({
  queryKey: ['explain', line.id, line.rulesVersion, line.waterfall.map((s) => `${s.key}:${s.delta}:${s.running}`).join('|')],
  queryFn: () => client.explain(line, rules),
  staleTime: Infinity,
  gcTime: Infinity,
});
