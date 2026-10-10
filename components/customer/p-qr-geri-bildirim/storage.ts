/**
 * Huninin tarayıcı belleği — her erişim try/catch (gizli mod, kapalı depolama, kota).
 *
 *  - Taslak (sessionStorage, QR başına): giriş/kayıt sayfasına gidip dönen ya da sayfayı
 *    yenileyen kullanıcı formunu kaybetmez (rapor envanter #49).
 *  - Giden kutusu (localStorage): çevrimdışıyken gönderilen yorum, `Idempotency-Key` ile
 *    birlikte saklanır; bağlantı gelince/sayfa yeniden açılınca gönderilir. 23 saat sonra
 *    düşer (sunucu idempotency penceresi 24 saat → çift kayıt olmaz).
 *  - Bekleyen bağlamalar (localStorage): oturumsuz gönderimin 24 saatlik bağlama belirteci.
 */
import type { SubmitFeedbackBody } from '@/lib/feedback-funnel/schema';

const DRAFT_PREFIX = 'qx-fb-draft:';
const OUTBOX_KEY = 'qx-fb-outbox';
const CLAIMS_KEY = 'qx-fb-claims';
export const OUTBOX_TTL_MS = 23 * 60 * 60 * 1000;

function read<T>(store: 'local' | 'session', key: string): T | null {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: 'local' | 'session', key: string, value: unknown): void {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalı — özellik sessizce devre dışı */
  }
}

// ───────────── Taslak ─────────────

export type FunnelDraft = {
  v: 1;
  step: 'rating' | 'details';
  rating: number | null;
  text: string;
  tags: string[];
  npsScore: number | null;
  staffId: string | null;
  /** Yalnız yüklemesi bitmiş fotoğrafların URL'leri. */
  media: { id: string; url: string }[];
  idemKey: string;
  savedAt: number;
};

const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export function loadDraft(code: string): FunnelDraft | null {
  const d = read<FunnelDraft>('session', DRAFT_PREFIX + code);
  if (!d || d.v !== 1 || typeof d.savedAt !== 'number' || Date.now() - d.savedAt > DRAFT_TTL_MS) return null;
  return d;
}

export function saveDraft(code: string, draft: Omit<FunnelDraft, 'v' | 'savedAt'>): void {
  write('session', DRAFT_PREFIX + code, { ...draft, v: 1, savedAt: Date.now() });
}

export function clearDraft(code: string): void {
  write('session', DRAFT_PREFIX + code, null);
}

// ───────────── Giden kutusu ─────────────

export type OutboxItem = { idemKey: string; code: string; venueName: string; body: SubmitFeedbackBody; createdAt: number };

export function readOutbox(now: number = Date.now()): OutboxItem[] {
  const list = read<OutboxItem[]>('local', OUTBOX_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter((i) => i && typeof i.idemKey === 'string' && typeof i.code === 'string' && now - i.createdAt < OUTBOX_TTL_MS);
}

export function writeOutbox(items: OutboxItem[]): void {
  write('local', OUTBOX_KEY, items.length ? items.slice(-10) : null);
}

export function enqueueOutbox(item: OutboxItem): void {
  const list = readOutbox().filter((i) => i.idemKey !== item.idemKey);
  list.push(item);
  writeOutbox(list);
}

// ───────────── Bekleyen bağlamalar ─────────────

export type PendingClaim = { token: string; code: string; venueName: string; points: number; expiresAt: string };

export function readClaims(now: number = Date.now()): PendingClaim[] {
  const list = read<PendingClaim[]>('local', CLAIMS_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter((c) => c && typeof c.token === 'string' && Date.parse(c.expiresAt) > now);
}

export function addClaim(claim: PendingClaim): void {
  const list = readClaims().filter((c) => c.token !== claim.token);
  list.push(claim);
  write('local', CLAIMS_KEY, list.slice(-10));
}

export function removeClaim(token: string): void {
  const list = readClaims().filter((c) => c.token !== token);
  write('local', CLAIMS_KEY, list.length ? list : null);
}

export function newIdempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    // Eski tarayıcı: zaman + rastgele (yalnız tekrar koruması için; güvenlik anahtarı değil).
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
