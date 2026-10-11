'use client';

import type {
  AlertItem,
  AuditRow,
  CaseActionInput,
  CaseDetail,
  CaseListItem,
  Paged,
  ResolutionCode,
  RulesState,
  ScanSummary,
  SubjectActionInput,
  SubjectProfile,
  TrustOverview,
  TrustRules,
} from '@/lib/admin-trust/contract';

/** Zarf v2 hatası — QueryState (`status`/`code`) ve formlar aynı nesneyi okur. */
export class TrustApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'TrustApiError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new TrustApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new TrustApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');

const BASE = '/api/admin/trust';
const enc = encodeURIComponent;

export const trustKeys = {
  all: ['admin-trust'] as const,
  overview: () => ['admin-trust', 'overview'] as const,
  cases: (qs: string) => ['admin-trust', 'cases', qs] as const,
  caseDetail: (id: string) => ['admin-trust', 'case', id] as const,
  alerts: (qs: string) => ['admin-trust', 'alerts', qs] as const,
  rules: () => ['admin-trust', 'rules'] as const,
  audit: (qs: string) => ['admin-trust', 'audit', qs] as const,
};

export const fetchOverview = (signal?: AbortSignal) => call<TrustOverview>(`${BASE}/overview`, { signal });
export const fetchCases = (qs: string, signal?: AbortSignal) => call<Paged<CaseListItem>>(`${BASE}/cases${qs ? `?${qs}` : ''}`, { signal });
export const fetchCase = (id: string, signal?: AbortSignal) => call<CaseDetail>(`${BASE}/cases/${enc(id)}`, { signal });
export const caseAction = (id: string, input: CaseActionInput) =>
  call<CaseDetail>(`${BASE}/cases/${enc(id)}`, { method: 'POST', body: JSON.stringify(input) });
export const bulkResolve = (input: { ids: string[]; code: ResolutionCode; note: string }) =>
  call<{ resolved: number; skipped: number }>(`${BASE}/cases/bulk`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
export const subjectAction = (userId: string, input: SubjectActionInput) =>
  call<SubjectProfile>(`${BASE}/subjects/${enc(userId)}`, { method: 'POST', body: JSON.stringify(input) });
export const reverseLedger = (ledgerId: string, input: { reason: string; caseId?: string }) =>
  call<{ reversed: number; balance: number; duplicate: boolean }>(`${BASE}/ledger/${enc(ledgerId)}/reverse`, { method: 'POST', body: JSON.stringify(input) });
export const runScan = () => call<ScanSummary>(`${BASE}/scan`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } });
export const fetchRules = (signal?: AbortSignal) => call<RulesState>(`${BASE}/rules`, { signal });
export const saveRules = (input: { rules: TrustRules; baseVersion: string | null; reason: string }) =>
  call<RulesState>(`${BASE}/rules`, { method: 'PUT', body: JSON.stringify(input) });
export const fetchAlerts = (qs: string, signal?: AbortSignal) => call<Paged<AlertItem>>(`${BASE}/alerts${qs ? `?${qs}` : ''}`, { signal });
export const alertAction = (input: { ids: string[]; action: 'read' | 'resolve' | 'reopen' }) =>
  call<{ updated: number }>(`${BASE}/alerts`, { method: 'POST', body: JSON.stringify(input) });
export const fetchAudit = (qs: string, signal?: AbortSignal) => call<Paged<AuditRow>>(`${BASE}/audit${qs ? `?${qs}` : ''}`, { signal });
export const exportUrl = (qs: string) => `${BASE}/cases/export${qs ? `?${qs}` : ''}`;
