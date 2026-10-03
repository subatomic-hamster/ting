import { DemoDataPill } from './DemoDataPill';

export interface Insight {
  id: string;
  title: string;
  metric: string;
  detail: string;
  n: number;
}

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{insight.title}</h2>
        <DemoDataPill />
      </div>
      <p className="tabular mt-2 text-3xl font-semibold">{insight.metric}</p>
      <p className="mt-1 text-sm text-muted">{insight.detail}</p>
      <p className="mt-3 text-xs text-muted">Group size: {insight.n} members</p>
    </article>
  );
}
