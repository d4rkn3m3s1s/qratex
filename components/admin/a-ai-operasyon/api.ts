'use client';

import type {
  AiOpsPeriod,
  AssistantAnswer,
  AssistantInput,
  BacklogAction,
  BacklogActionResult,
  BacklogSummary,
  BudgetReport,
  DealerAiPatch,
  DealersPage,
  DealersQuery,
  ErrorsPage,
  ErrorsQuery,
  PendingPage,
  PendingQuery,
  SignalFeedbacksPage,
  SignalFeedbacksQuery,
  SignalsReport,
  UsageReport,
} from '@/lib/admin-ai-ops/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar aynı nesneyi okur. */
export class AiOpsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'AiOpsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new AiOpsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new AiOpsApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};

export const aiOpsKeys = {
  all: ['admin-ai-ops'] as const,
  usage: (p: AiOpsPeriod) => ['admin-ai-ops', 'usage', p] as const,
  budget: () => ['admin-ai-ops', 'budget'] as const,
  errors: (q: ErrorsQuery) => ['admin-ai-ops', 'errors', q] as const,
  backlog: () => ['admin-ai-ops', 'backlog'] as const,
  pending: (q: PendingQuery) => ['admin-ai-ops', 'pending', q] as const,
  dealers: (q: DealersQuery) => ['admin-ai-ops', 'dealers', q] as const,
  signals: (p: AiOpsPeriod) => ['admin-ai-ops', 'signals', p] as const,
  signalFeedbacks: (q: SignalFeedbacksQuery) => ['admin-ai-ops', 'signal-feedbacks', q] as const,
};

const BASE = '/api/admin/ai-ops';

export const fetchUsage = (period: AiOpsPeriod, fresh = false) => call<UsageReport>(`${BASE}/usage?${qs({ period, fresh: fresh ? 1 : undefined })}`);
export const fetchBudget = () => call<BudgetReport>(`${BASE}/budget`);
export const fetchErrors = (q: ErrorsQuery) => call<ErrorsPage>(`${BASE}/errors?${qs(q)}`);
export const fetchBacklog = () => call<BacklogSummary>(`${BASE}/backlog`);
export const fetchPending = (q: PendingQuery) => call<PendingPage>(`${BASE}/backlog/pending?${qs(q)}`);
export const runBacklog = (body: BacklogAction) => call<BacklogActionResult>(`${BASE}/backlog`, { method: 'POST', body: JSON.stringify(body) });
export const fetchDealers = (q: DealersQuery) => call<DealersPage>(`${BASE}/dealers?${qs(q)}`);
export const patchDealerAi = (body: DealerAiPatch) =>
  call<{ dealerId: string; aiEnabled: boolean; autoAnalyze: boolean }>(`${BASE}/dealers`, { method: 'PATCH', body: JSON.stringify(body) });
export const fetchSignals = (period: AiOpsPeriod, fresh = false) => call<SignalsReport>(`${BASE}/signals?${qs({ period, fresh: fresh ? 1 : undefined })}`);
export const fetchSignalFeedbacks = (q: SignalFeedbacksQuery) => call<SignalFeedbacksPage>(`${BASE}/signals/feedbacks?${qs(q)}`);
export const askAssistant = (body: AssistantInput) => call<AssistantAnswer>(`${BASE}/assistant`, { method: 'POST', body: JSON.stringify(body) });
