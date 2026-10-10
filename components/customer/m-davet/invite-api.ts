/**
 * Davet yüzeyi istemci uçları (zarf v2: `{ ok, success, data, code, error, details }`).
 * Hata HİÇBİR ZAMAN boş veri gibi dönmez: `InviteApiError` fırlatılır (status + code),
 * `QueryState` onu türüne ayırır (moduleDisabled / forbidden / offline / generic).
 */
import type { InviteOverview, InviteRowsPage } from '@/lib/referral-invite';

export type { InviteOverview, InviteRow, InviteRowsPage, MilestoneStopState } from '@/lib/referral-invite';

export class InviteApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'InviteApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    throw new InviteApiError(body?.error || `HTTP ${res.status}`, res.status, body?.code, body?.details);
  }
  return body.data as T;
}

const BASE = '/api/customer/me/invite';

export const inviteKeys = {
  overview: ['customer', 'invite', 'overview'] as const,
  rows: ['customer', 'invite', 'rows'] as const,
};

export function fetchInviteOverview(): Promise<InviteOverview> {
  return call<InviteOverview>(BASE);
}

export function fetchInviteRows(cursor: string | null): Promise<InviteRowsPage> {
  const q = new URLSearchParams();
  if (cursor) q.set('cursor', cursor);
  return call<InviteRowsPage>(`${BASE}/referrals${q.size ? `?${q}` : ''}`);
}

export function ensureInviteCode(): Promise<{ code: string; codeActive: boolean }> {
  return call(`${BASE}/code`, { method: 'POST' });
}

export function applyInvite(code: string): Promise<{ status: 'PENDING' | 'COMPLETED'; pointsEarned: number; expiresAt: string }> {
  return call(`${BASE}/apply`, { method: 'POST', body: JSON.stringify({ code }) });
}

export function claimInviteMilestones(): Promise<{ awarded: number; points: number; milestones: number[] }> {
  return call(`${BASE}/milestones/claim`, { method: 'POST' });
}

export function nudgeInviteRow(
  id: string
): Promise<{ kind: 'nudged'; nextAt: string } | { kind: 'qualified'; points: number }> {
  return call(`${BASE}/referrals/${encodeURIComponent(id)}/nudge`, { method: 'POST' });
}
