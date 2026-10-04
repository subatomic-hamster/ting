import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type AskResult } from '../api';
import { costAnswer, planAnswer } from '../engine/answer';
import glossary from '../fixtures/glossary.json';
import { formatMoney } from '../lib/format';
import { useActive, useProfile } from '../store';

/** Winnow use 8: questions are routed. Plan and cost questions are answered by tested code; medical ones go to the dentist. */
export function AskTing() {
  const profile = useProfile();
  const active = useActive();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<{ text: string; by: string; result: AskResult }>();

  const ask = useMutation({
    mutationFn: async (question: string) => {
      // The only facts a model may use for an explanation: the plan and this schedule, as the engine computed them.
      const facts = [
        `Plan ${profile.currentPlan.name}: deductible ${formatMoney(profile.currentPlan.deductible.amount)}, annual maximum ${formatMoney(profile.currentPlan.annualMax)}.`,
        ...active.lines.map((l) => `${l.cdt}${l.tooth ? ` #${l.tooth}` : ''} on ${l.date}: dentist fee ${formatMoney(l.billed)}, plan pays ${formatMoney(l.planPaid)}, you pay ${formatMoney(l.memberOwes)}.`),
        `Total you pay: ${formatMoney(active.expectedOwes)}.`,
        ...Object.values(glossary as Record<string, { term: string; definition: string }>).map((g) => `${g.term}: ${g.definition}`),
      ].join('\n');
      const result = await api.ask(question, facts);
      const fromEngine =
        result.intent === 'plan_lookup' ? planAnswer(question, profile.currentPlan) : result.intent === 'engine_question' ? costAnswer(question, active) : undefined;
      const text =
        result.answer ?? fromEngine ?? planAnswer(question, profile.currentPlan) ?? costAnswer(question, active) ?? "Ting couldn't answer that from your plan and schedule.";
      return { text, by: result.answer ? (result.answerBy === 'model' ? 'Explained from the engine’s numbers' : 'Routed') : 'Answered by the engine', result };
    },
    onSuccess: setAnswer,
  });

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask.mutate(q.trim());
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          placeholder="e.g. What's my deductible? How much is my crown?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Ask about your plan"
        />
        <button type="submit" className="btn-primary" disabled={ask.isPending || !q.trim()}>
          {ask.isPending ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {answer && (
        <div className="mt-2 rounded-xl border border-line bg-white p-3 text-sm" aria-live="polite">
          <p>{answer.text}</p>
          <p className="mt-1 text-xs text-muted">
            {answer.by} · question type: {answer.result.intent.replace(/_/g, ' ')}
            {answer.result.p !== undefined && ` (${Math.round(answer.result.p * 100)}%)`}
            {answer.result.source && ` · ${answer.result.source === 'winnow' ? 'Winnow' : 'Winnow (simulated)'}`}
          </p>
        </div>
      )}
    </div>
  );
}
