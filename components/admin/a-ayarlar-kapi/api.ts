'use client';

import type { AccessState, HistoryPage, PlatformSettingsState, RevertPreview } from '@/lib/platform-settings/server';
import type { PlatformSettingKey } from '@/lib/platform-settings/registry';

/**
 * Ayarlar + Gizli Kapı istemci katmanı (zarf v2). Hata `status/code/details` taşır; kapı
 * oturumu düşmüşse (403 ADMIN_GATE_REQUIRED) geçide yönlendirir.
 */
export class SettingsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'SettingsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

export function goToGate(from: string) {
  window.location.href = `/admin-gate?from=${encodeURIComponent(from)}`;
}

/** Zarf v2 (`data`) ya da eski düz gövde — ikisini de okur. */
export async function call<T>(url: string, init?: Omit<RequestInit, 'body'> & { json?: unknown; legacy?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, body, headers });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new SettingsApiError(0, 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (parsed && typeof parsed === 'object' ? parsed : {}) as Envelope<T>;
  if (res.status === 403 && env.code === 'ADMIN_GATE_REQUIRED') {
    goToGate(window.location.pathname + window.location.search);
    throw new SettingsApiError(403, 'Kapı oturumunuz sona erdi. Geçide yönlendiriliyorsunuz.', env.code);
  }
  if (!res.ok || env.ok === false || env.success === false) {
    throw new SettingsApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null, env.details);
  }
  return (init?.legacy ? (parsed as T) : (env.data as T));
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Beklenmeyen bir hata oluştu.');
export const isConflict = (e: unknown) => e instanceof SettingsApiError && (e.status === 409 && e.code === 'VERSION_CONFLICT');

export const settingsKeys = {
  state: ['admin-platform-settings'] as const,
  access: ['admin-platform-settings', 'access'] as const,
  history: ['admin-platform-settings', 'history'] as const,
};

export const fetchState = (signal?: AbortSignal) =>
  call<{ state: PlatformSettingsState }>('/api/admin/platform-settings', { signal }).then((d) => d.state);

export type SettingChange = { key: PlatformSettingKey; value: unknown; baseVersion: string };

export const saveSettings = (changes: SettingChange[]) =>
  call<{ state: PlatformSettingsState }>('/api/admin/platform-settings', { method: 'PATCH', json: { changes } }).then((d) => d.state);

export const fetchHistory = (cursor: string | null, signal?: AbortSignal) =>
  call<HistoryPage>(`/api/admin/platform-settings/history?limit=15${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });

export const previewRevert = (auditLogId: string) =>
  call<{ preview: RevertPreview }>('/api/admin/platform-settings/revert', { method: 'POST', json: { auditLogId, dryRun: true } }).then(
    (d) => d.preview
  );

export const applyRevert = (auditLogId: string, baseVersion: string) =>
  call<{ preview: RevertPreview; state: PlatformSettingsState }>('/api/admin/platform-settings/revert', {
    method: 'POST',
    json: { auditLogId, baseVersion },
  });

export const fetchAccess = (signal?: AbortSignal) =>
  call<{ access: AccessState }>('/api/admin/platform-settings/access', { signal }).then((d) => d.access);

export const saveAccess = (input: {
  featureVisibility: AccessState['featureVisibility'];
  menuVisibility: AccessState['menuVisibility'];
  clearSystemBlocks?: boolean;
  baseVersions: { feature: string; menu: string; system?: string };
}) => call<{ access: AccessState }>('/api/admin/platform-settings/access', { method: 'PUT', json: input }).then((d) => d.access);

export type MailTestResult = {
  message?: string;
  delivery?: { channel: 'smtp' | 'resend'; effectiveFrom: string; usedResendAfterSmtpFailure: boolean };
};
export const sendTestMail = (to: string) =>
  call<MailTestResult>('/api/admin/email-test', { method: 'POST', json: to ? { to } : {}, legacy: true });

export const changePassword = (currentPassword: string, newPassword: string) =>
  call<{ message?: string }>('/api/user/password', { method: 'PATCH', json: { currentPassword, newPassword }, legacy: true });

export const updateProfile = (input: { name: string; image?: string }) =>
  call<unknown>('/api/user/profile', { method: 'PATCH', json: input, legacy: true });

/** Europe/Istanbul tarih-saat. */
export function formatIstanbul(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
