import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, onApiTrace, USE_MOCKS } from "../api";
import { useAuth } from "../auth/auth";
import { useAppStore } from "../store";
import { loadLiveProfile } from "../lib/profileCache";

/**
 * Loads plans, ledger and session through the API seam, wires the audit trail
 * and the live claims feed. The store starts from the persona's profile so the
 * engine always has data; API results replace it when they arrive.
 */
export function useBootstrap() {
  const authSub = useAuth((s) => s.claims?.sub);
  const lastAuth = useRef(authSub);
  useEffect(() => {
    if (lastAuth.current !== authSub) {
      lastAuth.current = authSub;
      const s = useAppStore.getState();
      s.loadPersona(s.personaId);
    }
  }, [authSub]);
  const personaId = useAppStore((s) => s.personaId);
  const setPlans = useAppStore((s) => s.setPlans);
  const setLedger = useAppStore((s) => s.setLedger);
  const applyClaim = useAppStore((s) => s.applyClaim);
  const addTrace = useAppStore((s) => s.addTrace);

  useEffect(() => onApiTrace(addTrace), [addTrace]);

  const session = useQuery({
    queryKey: ["session", personaId, authSub],
    queryFn: () => api.getSession(),
  });
  const plans = useQuery({
    queryKey: ["plans", personaId, authSub],
    queryFn: () => api.getPlans(),
  });
  const ledger = useQuery({
    queryKey: ["ledger", personaId, authSub],
    queryFn: () => api.getLedger(),
  });
  // Live: the member's profile as the server builds it from the insurer's records and the email agent's corpus.
  const merge = useAppStore((s) => s.mergeServerProfile);
  const live = useQuery({
    queryKey: ["profile", personaId, authSub],
    queryFn: () => loadLiveProfile(personaId, () => api.getProfile()),
    enabled: !USE_MOCKS,
  });
  useEffect(() => {
    if (live.data) merge(live.data);
  }, [live.data, merge]);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (USE_MOCKS) return undefined;
    // The agent read an email, the carrier changed something, or a claim landed: refetch what the server knows.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSignal = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
        void queryClient.invalidateQueries({ queryKey: ["received"] });
        void queryClient.invalidateQueries({ queryKey: ["outbox"] });
        void queryClient.invalidateQueries({ queryKey: ["carrier"] });
      }, 600);
    };
    window.addEventListener("ting:signal", onSignal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("ting:signal", onSignal);
    };
  }, [queryClient]);

  useEffect(() => {
    if (plans.data) setPlans(plans.data);
  }, [plans.data, setPlans]);

  useEffect(() => {
    if (ledger.data && !USE_MOCKS) setLedger(ledger.data);
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

  return {
    session: session.data,
    profileStatus: USE_MOCKS
      ? "ready"
      : live.isPending
        ? "loading"
        : live.isError || !live.data
          ? "error"
          : "ready",
    retryProfile: live.refetch,
  };
}
