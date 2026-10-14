/**
 * Kartım — çevrimdışı anlık görüntü + kart URL'si/numara biçimleri (saf; jest ile test edilir).
 *
 * Kasada sinyal düştüğünde son başarılı kart (ve üretilmiş QR görseli) gösterilir; QR statik
 * olduğundan kasada çalışmaya devam eder. Anlık görüntü kullanıcı kimliğiyle anahtarlanır,
 * yalnız aktif kartları ve QR için gereken alanları taşır (son işlemler/ürün adları değil).
 */
import type { WalletCard, WalletCardPayload } from './dto';

export const SNAPSHOT_VERSION = 2;
/** Bayat anlık görüntü gösterilmez (kart iptal/değişmiş olabilir). */
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** QR görseli başına üst sınır (bozuk/şişmiş veri depoya yazılmaz). */
const MAX_QR_DATA_URL = 200_000;

export interface WalletSnapshot {
  v: number;
  savedAt: number;
  holderName: string | null;
  cards: WalletCard[];
  /** token → QR data URL (çevrimdışıyken `qrcode` paketi yüklenemeyebilir). */
  qr: Record<string, string>;
}

export function snapshotKey(userId: string): string {
  return `qx:wallet-card:v${SNAPSHOT_VERSION}:${userId}`;
}

/** Eski sürümün anahtarı (temizlik için). */
export function legacySnapshotKey(userId: string): string {
  return `qx:my-card:v1:${userId}`;
}

export function buildSnapshot(data: Pick<WalletCardPayload, 'cards' | 'holderName'>, qr: Record<string, string>, now: number): WalletSnapshot | null {
  const cards = data.cards.filter((c) => c.status === 'ACTIVATED');
  if (cards.length === 0) return null;
  const keep: Record<string, string> = {};
  for (const c of cards) {
    const url = qr[c.token];
    if (typeof url === 'string' && url.startsWith('data:image/') && url.length <= MAX_QR_DATA_URL) keep[c.token] = url;
  }
  return { v: SNAPSHOT_VERSION, savedAt: now, holderName: data.holderName, cards, qr: keep };
}

function isCard(v: unknown): v is WalletCard {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.token === 'string' && r.token.length > 0 && r.status === 'ACTIVATED';
}

export function readSnapshot(raw: string | null, now: number): WalletSnapshot | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    if (!r || r.v !== SNAPSHOT_VERSION || typeof r.savedAt !== 'number') return null;
    if (now - r.savedAt > SNAPSHOT_MAX_AGE_MS || r.savedAt > now + 60_000) return null;
    const cards = Array.isArray(r.cards) ? r.cards.filter(isCard) : [];
    if (cards.length === 0) return null;
    const qrIn = r.qr && typeof r.qr === 'object' ? (r.qr as Record<string, unknown>) : {};
    const qr: Record<string, string> = {};
    for (const c of cards) {
      const url = qrIn[c.token];
      if (typeof url === 'string' && url.startsWith('data:image/') && url.length <= MAX_QR_DATA_URL) qr[c.token] = url;
    }
    return {
      v: SNAPSHOT_VERSION,
      savedAt: r.savedAt,
      holderName: typeof r.holderName === 'string' ? r.holderName : null,
      cards,
      qr,
    };
  } catch {
    return null;
  }
}

// ───────────────────────────── Kart URL'si ve numarası ─────────────────────────────

/** Kart URL'sinin kökeni: yapılandırılmış genel adres, yoksa sayfanın kökeni. */
export function resolveCardOrigin(configured: string | undefined | null, pageOrigin: string | undefined | null): string {
  const pick = (v: string | undefined | null) => {
    if (!v) return null;
    try {
      const u = new URL(v.trim());
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
    } catch {
      return null;
    }
  };
  return pick(configured) ?? pick(pageOrigin) ?? 'https://qratex.com';
}

export function buildCardUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/c/${encodeURIComponent(token)}`;
}

/**
 * Ekranda gösterilen maskeli kart numarası: son 8 karakter, 4'lü gruplar. Token büyük/küçük
 * harf duyarlıdır; büyütülmez (eski sürüm büyütüyordu → kasiyerin elle girdiği kod tutmuyordu).
 */
export function maskCardToken(token: string): string {
  const tail = token.slice(-8);
  const grouped = tail.length > 4 ? `${tail.slice(0, tail.length - 4)} ${tail.slice(-4)}` : tail;
  return `•••• ${grouped}`;
}

/**
 * Kasiyerin elle girebileceği TAM kod, 4'lü gruplar halinde (yalnız okunurluk için boşluk;
 * kasa ekranı `lib/qr-scan-targets#extractCardToken` boşluksuz tam token bekler). Eski
 * "son 8 hane" kısa kodu kasada hiçbir yerde kabul edilmiyordu (sahte yedek).
 */
export function groupedCardToken(token: string): string {
  return token.match(/.{1,4}/g)?.join(' ') ?? token;
}

/** Ekran okuyucu: büyük/küçük harf ayrımıyla tek tek okutur. */
export function cardTokenAria(token: string, locale: 'tr' | 'en' = 'tr'): string {
  const cap = locale === 'en' ? 'capital' : 'büyük';
  return token
    .split('')
    .map((ch) => (/[A-Z]/.test(ch) ? `${cap} ${ch}` : ch))
    .join(' ');
}
