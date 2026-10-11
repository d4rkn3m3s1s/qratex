'use client';

import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AiOpsPeriod, BacklogSummary, SignalKind, SignalsReport, UsageReport } from '@/lib/admin-ai-ops/contract';
import { aiOpsKeys, fetchBacklog, fetchBudget, fetchSignals, fetchUsage } from './api';

export type AiOpsCtx = {
  period: AiOpsPeriod;
  openSignal: (pick: { signal: SignalKind; value?: string; dealerId?: string; label?: string }) => void;
  goTab: (tab: string) => void;
  initial: { usage: UsageReport | null; signals: SignalsReport | null; backlog: BacklogSummary | null; period: AiOpsPeriod };
};
export const AiOpsContext = createContext<AiOpsCtx | null>(null);
export function useAiOps(): AiOpsCtx {
  const v = useContext(AiOpsContext);
  if (!v) throw new Error('useAiOps yalnız AiOpsCenter içinde kullanılır.');
  return v;
}

const STALE = 60_000;

export function useUsage() {
  const { period, initial } = useAiOps();
  return useQuery({
    queryKey: aiOpsKeys.usage(period),
    queryFn: () => fetchUsage(period),
    initialData: initial.period === period ? initial.usage ?? undefined : undefined,
    staleTime: STALE,
    refetchInterval: 120_000,
  });
}

export function useSignals() {
  const { period, initial } = useAiOps();
  return useQuery({
    queryKey: aiOpsKeys.signals(period),
    queryFn: () => fetchSignals(period),
    initialData: initial.period === period ? initial.signals ?? undefined : undefined,
    staleTime: STALE,
  });
}

export function useBacklog() {
  const { initial } = useAiOps();
  return useQuery({ queryKey: aiOpsKeys.backlog(), queryFn: fetchBacklog, initialData: initial.backlog ?? undefined, staleTime: 30_000, refetchInterval: 60_000 });
}

export function useBudget() {
  return useQuery({ queryKey: aiOpsKeys.budget(), queryFn: fetchBudget, staleTime: 30_000, refetchInterval: 120_000 });
}
