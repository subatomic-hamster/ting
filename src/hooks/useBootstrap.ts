import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, onApiTrace } from '../api';
import { useAppStore } from '../store';

/**
 * Loads plans, ledger and session through the API seam, wires the audit trail
 * and the live claims feed. The store starts from the persona's profile so the
 * engine always has data; API results replace it when they arrive.
 */
export function useBootstrap() {
  const personaId = useAppStore((s) => s.personaId);
  const setPlans = useAppStore((s) => s.setPlans);
  const setLedger = useAppStore((s) => s.setLedger);
  const applyClaim = useAppStore((s) => s.applyClaim);
  const addTrace = useAppStore((s) => s.addTrace);

  useEffect(() => onApiTrace(addTrace), [addTrace]);

  const session = useQuery({ queryKey: ['session', personaId], queryFn: () => api.getSession() });
  const plans = useQuery({ queryKey: ['plans', personaId], queryFn: () => api.getPlans() });
  const ledger = useQuery({ queryKey: ['ledger', personaId], queryFn: () => api.getLedger() });

  useEffect(() => {
    if (plans.data) setPlans(plans.data);
  }, [plans.data, setPlans]);

  useEffect(() => {
    if (ledger.data) setLedger(ledger.data);
  }, [ledger.data, setLedger]);

  // Subscribe once the starting ledger is in, so replayed claims land on top of it instead of being overwritten.
  const ledgerReady = ledger.isSuccess || ledger.isError;
  useEffect(() => {
    if (!ledgerReady) return undefined;
    try {
      return api.subscribeLedger(applyClaim);
    } catch (err) {
      console.warn(err);
      return undefined;
    }
  }, [applyClaim, personaId, ledgerReady]);

  return { session: session.data };
}
