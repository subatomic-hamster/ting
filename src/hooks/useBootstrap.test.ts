// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { PERSONAS } from '../data/personas';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import { useAppStore } from '../store';
import { useBootstrap } from './useBootstrap';

const server = PERSONAS.dale.profile('2026-10-04');
server.currentPlan = { ...server.currentPlan, name: 'Loaded member plan' };
vi.mock('../lib/drafts', () => ({ readDraft: vi.fn(), saveDraft: vi.fn() }));
vi.mock('../api', () => ({
  USE_MOCKS: false,
  onApiTrace: vi.fn(() => () => {}),
  api: { getSession: vi.fn(), getPlans: vi.fn(), getLedger: vi.fn(), getProfile: vi.fn(), subscribeLedger: vi.fn(() => () => {}) },
}));
import { api } from '../api';
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

it('only exposes ready member pages after applying the fetched server profile', async () => {
  useAppStore.getState().reset();
  vi.mocked(api.getSession).mockResolvedValue({ name: 'Dale', employer: 'Acme', memberId: 'M-10456' } as Awaited<ReturnType<typeof api.getSession>>);
  vi.mocked(api.getPlans).mockResolvedValue(DEMO_PLAN_OPTIONS);
  vi.mocked(api.getLedger).mockResolvedValue(server.ledger);
  vi.mocked(api.getProfile).mockResolvedValue(server);
  const readyPlans: string[] = [];
  function Harness() {
    const bootstrap = useBootstrap();
    const profile = useAppStore(s => s.profile);
    if (bootstrap.profileStatus === 'ready') readyPlans.push(profile.currentPlan.name);
    return createElement('p', null, bootstrap.profileStatus);
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client }, createElement(Harness)));
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.textContent).toBe('ready');
    expect(readyPlans.length).toBeGreaterThan(0);
    expect(readyPlans.every(name => name === 'Loaded member plan')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
