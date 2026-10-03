import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import type { TraceEvent } from '../api';
import { formatTime } from '../lib/format';
import { useAppStore } from '../store';
import { CloseIcon } from './Icons';

const originOf = (tool: string) => (tool.startsWith('engine.') ? 'engine' : tool.startsWith('api.') ? 'api' : 'ui');

export function AuditDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trace = useAppStore((s) => s.trace);
  const rulesVersion = useAppStore((s) => s.profile.currentPlan.version);
  const closeRef = useRef<HTMLButtonElement>(null);

  const events = useMemo(
    () => trace.map((e) => ({ ...e, origin: originOf(e.tool) })).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)),
    [trace],
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="no-print fixed inset-0 z-40 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            id="audit-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Audit trail"
            className="no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <h2 className="text-lg font-semibold">Audit trail</h2>
                <p className="text-xs text-muted">
                  Show your work: every engine run and API call, newest first. Rules version{' '}
                  <code className="rounded bg-slate-100 px-1">{rulesVersion}</code>.
                </p>
                <p className="mt-1 text-xs text-muted">The AI translates, tested code decides.</p>
              </div>
              <button ref={closeRef} type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close audit trail">
                <CloseIcon />
              </button>
            </div>
            <ol className="flex-1 divide-y divide-line overflow-y-auto text-sm">
              {events.map((e: TraceEvent & { origin: string }, i) => (
                <li key={`${e.ts}-${e.tool}-${i}`} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-mono font-semibold">
                      <span
                        className={`rounded px-1 py-px text-[10px] uppercase ${
                          e.origin === 'engine'
                            ? 'bg-brand-100 text-brand-900'
                            : e.origin === 'api'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {e.origin}
                      </span>
                      {e.tool}
                    </span>
                    <span className="tabular shrink-0 text-muted">
                      {formatTime(e.ts)} · {e.ms} ms
                    </span>
                  </div>
                  <p className="mt-0.5 text-ink">{e.summary}</p>
                </li>
              ))}
            </ol>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
