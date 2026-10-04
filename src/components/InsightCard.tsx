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
      <h2 className="text-sm font-medium text-muted">{insight.title}</h2>
      <p className="tabular mt-2 text-3xl font-semibold">{insight.metric}</p>
      <p className="mt-1 text-sm text-muted">{insight.detail}</p>
      <p className="mt-3 text-xs text-muted">Group size: {insight.n} members</p>
    </article>
  );
}
