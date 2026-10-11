'use client';

import type { ReplyCondition, ReplyRuleBody } from '@/lib/dealer-automation/reply-rules';
import type { RemedyAutomationConfig } from '@/lib/dealer-automation/remedy-config';
import type { RadarRules } from '@/lib/dealer-queues/radar-rules';
import type {
  AlertsOverviewDto,
  AlertsStatusDto,
  RemedyOverviewDto,
  RemedyScanResultDto,
  RepliesOverviewDto,
  ReplyPreviewDto,
  ReplyRunDto,
} from '@/lib/dealer-automation/types';

/** Zarf v2 hatası — `QueryState` (`status`) ve form katmanı (`code`, `details`) aynı nesneyi okur. */
export class AutomationApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details: unknown) {
    super(message);
    this.name = 'AutomationApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function idempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function call<T>(url: string, init?: RequestInit & { idempotent?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.idempotent) headers['Idempotency-Key'] = idempotencyKey();
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz yanıt */
  }
  const env = (body && typeof body === 'object' ? body : {}) as { success?: boolean; ok?: boolean; data?: T; error?: string; code?: string; details?: unknown };
  if (!res.ok || env.success === false || env.ok === false) {
    throw new AutomationApiError(res.status || 500, env.error || 'İstek tamamlanamadı. Lütfen tekrar deneyin.', env.code ?? null, env.details);
  }
  return env.data as T;
}

export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}

const R = '/api/dealer/automation/replies';
export const fetchReplies = (signal?: AbortSignal) => call<RepliesOverviewDto>(R, { signal });
export const createReplyRule = (body: ReplyRuleBody) => call<{ id: string }>(R, { method: 'POST', body: JSON.stringify(body), idempotent: true });
export const updateReplyRule = (id: string, body: ReplyRuleBody) =>
  call<{ id: string }>(`${R}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const setReplyRuleState = (id: string, isActive: boolean) =>
  call<{ id: string; isActive: boolean }>(`${R}/${encodeURIComponent(id)}/state`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
export const deleteReplyRule = (id: string) =>
  call<{ id: string; snapshot: Record<string, unknown> }>(`${R}/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const reorderReplyRules = (ids: string[]) => call<{ ids: string[] }>(`${R}/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });
export const previewReply = (condition: ReplyCondition, signal?: AbortSignal) =>
  call<ReplyPreviewDto>(`${R}/preview`, { method: 'POST', body: JSON.stringify({ condition }), signal });
export const fetchReplyRuns = (id: string, signal?: AbortSignal) =>
  call<{ runs: ReplyRunDto[] }>(`${R}/${encodeURIComponent(id)}/runs`, { signal });

const M = '/api/dealer/automation/remedy';
export const fetchRemedy = (signal?: AbortSignal) => call<RemedyOverviewDto>(M, { signal });
export const saveRemedyConfig = (cfg: RemedyAutomationConfig) =>
  call<{ config: RemedyAutomationConfig }>(M, { method: 'PATCH', body: JSON.stringify(cfg) });
export const scanRemedy = (dryRun: boolean) => call<RemedyScanResultDto>(`${M}/scan`, { method: 'POST', body: JSON.stringify({ dryRun }) });
export const createRemedyTemplate = (body: { locationId: string | null; type: string; label?: string | null; values: number[]; isActive: boolean }) =>
  call<{ id: string }>(`${M}/templates`, { method: 'POST', body: JSON.stringify(body), idempotent: true });
export const updateRemedyTemplate = (id: string, body: { label?: string | null; values?: number[]; isActive?: boolean; move?: 'up' | 'down' }) =>
  call<{ id: string }>(`${M}/templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteRemedyTemplate = (id: string) => call<{ id: string }>(`${M}/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });

const A = '/api/dealer/automation/alerts';
export const fetchAlerts = (signal?: AbortSignal) => call<AlertsOverviewDto>(A, { signal });
export const saveAlerts = (rules: RadarRules) => call<{ rules: RadarRules }>(A, { method: 'PATCH', body: JSON.stringify(rules) });
export const previewAlerts = (rules: RadarRules, signal?: AbortSignal) =>
  call<AlertsStatusDto>(`${A}/preview`, { method: 'POST', body: JSON.stringify(rules), signal });

const nf = new Intl.NumberFormat('tr-TR');
export const fmtInt = (n: number) => nf.format(n);
export const fmtPct = (r: number) => `%${Math.round(r * 100)}`;

const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
export function fmtRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'az önce';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
