'use client';

/**
 * KVKK talepleri ekranı — istemci veri katmanı. Zarf v2 (`{ ok, data, error, code }`) çözülür;
 * hata HİÇBİR ZAMAN boş liste gibi dönmez (`ApiRequestError` fırlatılır).
 */
import type { DsrCommand } from '@/lib/dsr-workflow';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok === false || json.success === false) {
    const message =
      (json && typeof json.error === 'string' && json.error) ||
      (res.status === 401 || res.status === 403 ? 'Bu işlem için yetkiniz yok.' : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    throw new ApiRequestError(message, res.status, typeof json?.code === 'string' ? json.code : undefined, json?.details);
  }
  return (json.data ?? json) as T;
}

export type DsrListStatus = 'open' | 'overdue' | 'due_soon' | 'completed' | 'rejected' | 'all';
export type DsrTypeKey = 'access' | 'deletion' | 'rectification' | 'objection';

export interface DsrListRow {
  id: string;
  email: string;
  type: DsrTypeKey | string;
  status: string;
  message: string | null;
  receiptSentAt: string | null;
  createdAt: string;
  processedAt: string | null;
  userId: string | null;
  dueAt: string;
  daysLeft: number | null;
  account: { email: string; name: string | null; role: string; anonymized: boolean; emailMismatch: boolean } | null;
  lastEvent: { type: string; label: string; at: string } | null;
  eventCount: number;
}

export interface DsrListResponse {
  requests: DsrListRow[];
  nextCursor: string | null;
  stats: { open: number; overdue: number; dueSoon: number; completed30: number; avgResponseDays: number | null };
}

export interface DsrEventRow {
  id: string;
  type: string;
  label: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null; role: string | null } | null;
}

export interface DsrDetailResponse {
  request: DsrListRow & {
    account: (DsrListRow['account'] & { createdAt?: string }) | null;
  };
  events: DsrEventRow[];
  missingEvidence: string[];
  allowedCommands: DsrCommand[];
  inventory: Record<string, number> | null;
}

export async function fetchDsrList(params: {
  status: DsrListStatus;
  type?: string;
  q?: string;
  cursor?: string | null;
}): Promise<DsrListResponse> {
  const sp = new URLSearchParams({ status: params.status });
  if (params.type) sp.set('type', params.type);
  if (params.q) sp.set('q', params.q);
  if (params.cursor) sp.set('cursor', params.cursor);
  const res = await fetch(`/api/admin/privacy-requests?${sp.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  return parse<DsrListResponse>(res);
}

export async function fetchDsrDetail(id: string, inventory = false): Promise<DsrDetailResponse> {
  const res = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(id)}${inventory ? '?inventory=1' : ''}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parse<DsrDetailResponse>(res);
}

export interface CommandResult {
  message?: string;
  completed?: boolean;
  status?: string;
  notified?: boolean;
}

export async function runDsrCommand(
  id: string,
  action: DsrCommand,
  input: { reason?: string; confirmEmail?: string } = {}
): Promise<CommandResult | { downloaded: true }> {
  const res = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...input }),
  });
  const type = res.headers.get('content-type') ?? '';
  const dispo = res.headers.get('content-disposition') ?? '';
  if (res.ok && dispo.includes('attachment') && type.includes('json')) {
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(dispo)?.[1] ?? `kvkk-paket-${id}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Bazı tarayıcılar aynı tick'te iptal ediyordu.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { downloaded: true };
  }
  return parse<CommandResult>(res);
}

export interface ManualDsrBody {
  type: DsrTypeKey;
  email: string;
  channel: 'email' | 'phone' | 'mail' | 'in_person' | 'other';
  receivedOn?: string;
  message?: string;
}

/** E-posta/telefon/posta ile gelen başvuruyu kuyruğa alır (yasal süre başvuru gününden başlar). */
export async function createManualDsr(body: ManualDsrBody): Promise<{ id: string; linkedAccount: boolean; receiptSent: boolean; message: string }> {
  const res = await fetch('/api/admin/privacy-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return parse(res);
}
