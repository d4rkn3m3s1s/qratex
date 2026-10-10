/**
 * Masa sinyali istemci yardımcıları — gönderim + çevrimdışı kuyruk (saf; jest ile test edilir).
 *
 * Restoranda zayıf sinyal yaygın (rapor bulgu 3, envanter #35): istek ağ yüzünden düşerse sinyal
 * kaybolmaz; `localStorage` kuyruğuna alınır ve `online` olayında aynı `Idempotency-Key` ile
 * yeniden gönderilir (sunucu tekrarı ikinci kayıt saymaz). Misafire "iletildi" DENMEZ;
 * "bu cihazda bekliyor" denir. Kuyruk 30 dk'dan eski sinyali atar (bayat istek ekibi yanıltmasın).
 */
import type { ConcernReason, RequestType, SignalKind, SignalStage } from '@/lib/table-signal/kinds';

export interface SignalPayload {
  qr?: string;
  dealerId?: string;
  qrCodeId?: string;
  kind: SignalKind;
  reasons?: ConcernReason[];
  requestType?: RequestType;
  tableCode?: string;
  note?: string;
  linkAccount?: boolean;
}

export interface TrackingInfo {
  ref: string;
  key: string;
  expiresAt: string;
}

export interface SignalSuccess {
  kind: SignalKind;
  duplicate: boolean;
  stage: SignalStage;
  tracking: TrackingInfo | null;
  teamNotified: boolean;
  linked: boolean;
}

export type SendOutcome =
  | { ok: true; data: SignalSuccess }
  | { ok: false; network: true }
  | { ok: false; network: false; code: string; message: string | null; retryAfterSec: number | null };

export interface QueuedSignal {
  nonce: string;
  createdAt: number;
  payload: SignalPayload;
}

export const SIGNAL_QUEUE_KEY = 'qx:table-signal-queue:v1';
export const QUEUE_MAX = 5;
export const QUEUE_TTL_MS = 30 * 60_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isQueued(v: unknown): v is QueuedSignal {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const p = r.payload as Record<string, unknown> | undefined;
  return (
    typeof r.nonce === 'string' &&
    r.nonce.length >= 16 &&
    typeof r.createdAt === 'number' &&
    !!p &&
    typeof p === 'object' &&
    (p.kind === 'OK' || p.kind === 'CONCERN' || p.kind === 'REQUEST')
  );
}

export function readQueue(storage: StorageLike | null, now: number): QueuedSignal[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SIGNAL_QUEUE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(isQueued).filter((q) => now - q.createdAt <= QUEUE_TTL_MS && q.createdAt <= now + 60_000);
  } catch {
    return [];
  }
}

function writeQueue(storage: StorageLike | null, list: QueuedSignal[]): void {
  if (!storage) return;
  try {
    if (list.length === 0) storage.removeItem(SIGNAL_QUEUE_KEY);
    else storage.setItem(SIGNAL_QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX)));
  } catch {
    // Depolama kapalı/dolu: kuyruk yalnız bellekte kalır (sayfa açıkken yine denenir).
  }
}

export function enqueueSignal(storage: StorageLike | null, item: QueuedSignal, now: number): QueuedSignal[] {
  const list = readQueue(storage, now).filter((q) => q.nonce !== item.nonce);
  list.push(item);
  const next = list.slice(-QUEUE_MAX);
  writeQueue(storage, next);
  return next;
}

export function removeQueued(storage: StorageLike | null, nonce: string, now: number): QueuedSignal[] {
  const next = readQueue(storage, now).filter((q) => q.nonce !== nonce);
  writeQueue(storage, next);
  return next;
}

export function newNonce(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function retryAfterOf(res: Response): number | null {
  const v = Number(res.headers.get('retry-after'));
  return Number.isFinite(v) && v > 0 ? Math.ceil(v) : null;
}

/** Tek gönderim. Ağ hatası (fetch reddi / tarayıcı çevrimdışı) `network: true` döner. */
export async function sendSignal(payload: SignalPayload, nonce: string, fetchImpl: typeof fetch = fetch): Promise<SendOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, network: true };
  let res: Response;
  try {
    res = await fetchImpl('/api/innovation/table-pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': nonce },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, network: true };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // HTML 5xx ya da gövdesiz: aşağıda koda dönüşür.
  }
  if (res.ok) {
    const data = (json.data ?? json) as Partial<SignalSuccess>;
    return {
      ok: true,
      data: {
        kind: (data.kind as SignalKind) ?? payload.kind,
        duplicate: data.duplicate === true,
        stage: (data.stage as SignalStage) ?? 'sent',
        tracking: data.tracking && typeof data.tracking === 'object' ? (data.tracking as TrackingInfo) : null,
        teamNotified: data.teamNotified === true,
        linked: data.linked === true,
      },
    };
  }
  const code = typeof json.code === 'string' ? json.code : res.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'generic';
  return {
    ok: false,
    network: false,
    code,
    message: typeof json.error === 'string' ? json.error : null,
    retryAfterSec: retryAfterOf(res),
  };
}

export type StatusOutcome =
  | { ok: true; stage: SignalStage; updatedAt: string }
  | { ok: false; expired: boolean };

export async function fetchSignalStatus(t: TrackingInfo, fetchImpl: typeof fetch = fetch): Promise<StatusOutcome> {
  try {
    const res = await fetchImpl(
      `/api/innovation/table-pulse/status?ref=${encodeURIComponent(t.ref)}&key=${encodeURIComponent(t.key)}`,
      { cache: 'no-store' }
    );
    if (res.status === 404) return { ok: false, expired: true };
    if (!res.ok) return { ok: false, expired: false };
    const json = (await res.json()) as { data?: { stage?: SignalStage; updatedAt?: string } };
    const stage = json.data?.stage;
    if (stage !== 'sent' && stage !== 'seen' && stage !== 'resolved') return { ok: false, expired: false };
    return { ok: true, stage, updatedAt: json.data?.updatedAt ?? new Date().toISOString() };
  } catch {
    return { ok: false, expired: false };
  }
}

/** Takip bilgisi oturum boyunca saklanır (sayfa yenilense de durum görünsün). */
export const TRACK_STORAGE_PREFIX = 'qx:table-signal-track:';

export interface StoredTrack {
  kind: SignalKind;
  tracking: TrackingInfo;
  stage: SignalStage;
  duplicate: boolean;
}

export function readStoredTrack(storage: StorageLike | null, scope: string, now: number): StoredTrack | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TRACK_STORAGE_PREFIX + scope);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredTrack;
    if (!v?.tracking?.ref || !v.tracking.key || Date.parse(v.tracking.expiresAt) < now) return null;
    return v;
  } catch {
    return null;
  }
}

export function writeStoredTrack(storage: StorageLike | null, scope: string, value: StoredTrack | null): void {
  if (!storage) return;
  try {
    if (value) storage.setItem(TRACK_STORAGE_PREFIX + scope, JSON.stringify(value));
    else storage.removeItem(TRACK_STORAGE_PREFIX + scope);
  } catch {
    // yut
  }
}
