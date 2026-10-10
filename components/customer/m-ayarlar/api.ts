/**
 * Ayarlar istemci uçları (zarf v2). Hata HİÇBİR ZAMAN boş veri gibi dönmez:
 * `SettingsApiError` fırlatılır (status + code), ekran kullanıcının dilinde gösterir.
 */
import type {
  CustomerPreferences,
  CustomerSettingsSnapshot,
  ReauthMethod,
  TextScale,
} from '@/lib/customer-settings/contract';
import type { NotificationChannel } from '@/lib/notification-prefs';

export class SettingsApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: Record<string, unknown> | null;
  constructor(message: string, status: number, code?: string, body?: Record<string, unknown> | null) {
    super(message);
    this.name = 'SettingsApiError';
    this.status = status;
    this.code = code;
    this.body = body ?? null;
  }
}

type Envelope<T> = { success?: boolean; data?: T; error?: string; code?: string } & Record<string, unknown>;

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    throw new SettingsApiError(body?.error || `HTTP ${res.status}`, res.status, body?.code, body);
  }
  return (body.data ?? (body as unknown)) as T;
}

const BASE = '/api/customer/me/settings';

export const settingsKeys = {
  snapshot: ['customer', 'settings', 'snapshot'] as const,
  deletePreview: ['customer', 'settings', 'delete-preview'] as const,
};

export const fetchSettings = () => call<CustomerSettingsSnapshot>(BASE);

export type PreferencesPatch = Partial<{
  language: 'tr' | 'en';
  showLeaderboard: boolean;
  highContrast: boolean;
  reduceAnimations: boolean;
  colorblindMode: boolean;
  textScale: TextScale;
}>;

export const patchPreferences = (patch: PreferencesPatch) =>
  call<{ preferences: CustomerPreferences }>(`${BASE}/preferences`, { method: 'PATCH', body: JSON.stringify(patch) });

export const patchNotificationCell = (key: string, channel: NotificationChannel, enabled: boolean) =>
  call<{ key: string; channel: NotificationChannel; enabled: boolean }>(`${BASE}/notifications`, {
    method: 'PATCH',
    body: JSON.stringify({ key, channel, enabled }),
  });

export const patchProfile = (patch: { name?: string; image?: string }) =>
  call<{ name: string; image: string | null; changed: boolean }>(`${BASE}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const revokeSessions = (scope: 'others' | 'all') =>
  call<{ scope: string; revokedAt: string; reissued: boolean }>(`${BASE}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });

export const removePushDevice = (id: string) =>
  call<{ id: string }>(`${BASE}/push-devices/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const saveFrameColor = (hue: number | null) =>
  call<{ customFrameColor: string | null }>('/api/customer/custom-color', {
    method: 'POST',
    body: JSON.stringify({ customFrameColor: hue === null || hue === 0 ? null : String(hue) }),
  });

export const saveBirthday = (birthDate: string) =>
  call<{ message?: string }>('/api/birthday', { method: 'POST', body: JSON.stringify({ action: 'set', birthDate }) });

export interface DeletePreview {
  selfDeleteAllowed: boolean;
  alreadyAnonymized: boolean;
  blockers: string[];
  losses: { points: number; badges: number; rewards: number; feedbacks: number; reviews: number };
  reauth: { methods: ReauthMethod[]; recentLoginFresh: boolean };
}

export const fetchDeletePreview = () => call<DeletePreview>('/api/user/delete-account');

export const deleteAccount = (input: { confirmEmail: string; password?: string; totp?: string }) =>
  call<{ message?: string }>('/api/user/delete-account', { method: 'DELETE', body: JSON.stringify(input) });

/** Eski uçlar (`{ error }` gövdeli) — şifre ve 2FA. */
export async function callLegacy<T = Record<string, unknown>>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok || !body) {
    throw new SettingsApiError(body?.error || `HTTP ${res.status}`, res.status, body?.code, body as Record<string, unknown> | null);
  }
  return body;
}
