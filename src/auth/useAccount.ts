// Who is using the app: a signed-up member (their record loaded and registered, the store switched to them),
// an employer SSO user, or a guest exploring the sample members.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api';
import { registerMember } from '../data/members';
import { useAppStore } from '../store';
import { currentMemberId, useAuth } from './auth';

export type AccountStatus = 'guest' | 'sso' | 'loading' | 'needsSurvey' | 'member' | 'error';

const SAMPLE = 'ting.sample';

/** Guests opt into the sample members explicitly (a demo link, or "Explore a sample member"). */
export function sampleMode(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const q = new URLSearchParams(window.location.search);
    if (q.has('persona') || q.has('demo')) sessionStorage.setItem(SAMPLE, '1');
    return sessionStorage.getItem(SAMPLE) === '1';
  } catch {
    return true;
  }
}

export function enterSampleMode() {
  try {
    sessionStorage.setItem(SAMPLE, '1');
  } catch {
    /* blocked storage: the sample still opens for this page view */
  }
}

export function useAccount() {
  const kind = useAuth((s) => s.kind);
  const sub = useAuth((s) => s.claims?.sub);
  const memberId = sub ? currentMemberId() : undefined;
  const record = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => api.getMember(),
    enabled: !!memberId,
    retry: 1,
  });
  const data = record.data;
  useEffect(() => {
    if (!data) return;
    registerMember(data);
    const s = useAppStore.getState();
    // A re-saved survey or shared brushing data changes the starting profile: rebuild it, keeping added work.
    if (s.personaId === data.memberId) s.refreshMember();
    else s.loadPersona(data.memberId);
  }, [data]);
  const personaId = useAppStore((s) => s.personaId);
  const status: AccountStatus = !kind
    ? 'guest'
    : kind === 'sso'
      ? 'sso'
      : record.isError
        ? 'error'
        : record.isPending
          ? 'loading'
          : !data
            ? 'needsSurvey'
            : personaId === data.memberId
              ? 'member'
              : 'loading';
  return { status, record: data ?? undefined, memberId, retry: record.refetch };
}
