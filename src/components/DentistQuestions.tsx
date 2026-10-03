import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useDentistQuestions } from '../hooks/useDentistQuestions';
import { useResult } from '../store';
import { ShareIcon } from './Icons';

export function DentistQuestions() {
  const questions = useDentistQuestions();
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {questions.map((q) => (
        <li key={q}>{q}</li>
      ))}
    </ol>
  );
}

export function ShareWithDentist({ compact = false }: { compact?: boolean }) {
  const result = useResult();
  const [copied, setCopied] = useState(false);
  const share = useMutation({ mutationFn: () => api.createShareLink(result.activeSchedule.kind) });

  return (
    <div>
      <button type="button" className={compact ? 'btn-secondary' : 'btn-primary'} onClick={() => share.mutate()} disabled={share.isPending}>
        <ShareIcon /> {share.isPending ? 'Creating link…' : 'Share with my dentist'}
      </button>
      {share.data && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-brand-50 p-2 text-xs">
          <a href={share.data.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-brand-700 underline">
            {share.data.url}
          </a>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(share.data.url).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
