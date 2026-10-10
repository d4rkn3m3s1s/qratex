/**
 * Kartım sayfası — saf yardımcılar (Jest ile test edilir).
 *
 *  - Yanıt doğrulama: `GET /api/customer/cards` hata/eksik gövdede sessizce "kartın yok"
 *    gösterilmesin diye sözleşme burada denetlenir (hata ≠ boş).
 *  - Çevrimdışı anlık görüntü: kasada sinyal düştüğünde son başarılı kart gösterilir.
 *  - Kart URL'si: sabit `demoqratex.vercel.app` yerine ortamın kökeni (NEXT_PUBLIC_APP_URL ya
 *    da sayfanın kökeni); kasadaki tarayıcı `/c/<token>` kalıbını alan adından bağımsız okur.
 */

export interface CardConsumption {
  id: string;
  createdAt: string;
  dealer: { id: string; businessName: string | null } | null;
  product: { id: string; name: string } | null;
}

export interface MyCard {
  id: string;
  token: string;
  status: string;
  activatedAt: string | null;
  consumptionsCount: number;
  consumptions: CardConsumption[];
}

export interface MyCardsData {
  cards: MyCard[];
  stats: { totalCards: number; totalConsumptions: number; reviewPending: number };
}

/** Admin karakter testi sentetik kartları (app/api/admin/character-test) kullanıcıya gösterilmez. */
const SYNTHETIC_BLOCK_REASON = '[KARAKTER-TEST]';

export class CardsContractError extends Error {
  constructor(message = 'Kart yanıtı beklenen biçimde değil') {
    super(message);
    this.name = 'CardsContractError';
  }
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function parseConsumption(v: unknown): CardConsumption | null {
  const r = rec(v);
  const id = r ? str(r.id) : null;
  const createdAt = r ? str(r.createdAt) : null;
  if (!r || !id || !createdAt) return null;
  const d = rec(r.dealer);
  const p = rec(r.product);
  return {
    id,
    createdAt,
    dealer: d ? { id: str(d.id) ?? '', businessName: str(d.businessName) } : null,
    product: p && str(p.name) ? { id: str(p.id) ?? '', name: str(p.name) as string } : null,
  };
}

/** Tek kart: token ve kimliği olmayan kayıt atlanır (QR üretilemez). */
export function parseCard(v: unknown): MyCard | null {
  const r = rec(v);
  if (!r) return null;
  const id = str(r.id);
  const token = str(r.token);
  if (!id || !token) return null;
  if (r.blockReason === SYNTHETIC_BLOCK_REASON) return null;
  const count = rec(r._count);
  const consumptions = Array.isArray(r.consumptions)
    ? r.consumptions.map(parseConsumption).filter((c): c is CardConsumption => c !== null)
    : [];
  return {
    id,
    token,
    status: str(r.status) ?? 'UNUSED',
    activatedAt: str(r.activatedAt),
    consumptionsCount: count ? int(count.consumptions) : int(r.consumptionsCount),
    consumptions,
  };
}

/**
 * Yanıt gövdesi → doğrulanmış veri. `success:false`, eksik `cards` dizisi gibi durumlar
 * HATA fırlatır (eski sayfa bunları "Henüz kartın yok" olarak gösteriyordu). Zarf v2
 * (`data` içinde) de kabul edilir.
 */
export function parseCardsResponse(body: unknown): MyCardsData {
  const root = rec(body);
  if (!root || root.success === false) throw new CardsContractError();
  const src = rec(root.data) && Array.isArray(rec(root.data)?.cards) ? (rec(root.data) as Record<string, unknown>) : root;
  if (!Array.isArray(src.cards)) throw new CardsContractError();
  const cards = src.cards.map(parseCard).filter((c): c is MyCard => c !== null);
  const s = rec(src.stats);
  return {
    cards,
    stats: {
      totalCards: cards.length,
      totalConsumptions: s ? int(s.totalConsumptions) : cards.reduce((a, c) => a + c.consumptionsCount, 0),
      reviewPending: s ? int(s.reviewPending) : 0,
    },
  };
}

/** Kart URL'sinin kökeni: yapılandırılmış genel adres, yoksa sayfanın kökeni. */
export function resolveCardOrigin(configured: string | undefined | null, pageOrigin: string | undefined | null): string {
  const pick = (v: string | undefined | null) => {
    if (!v) return null;
    try {
      const u = new URL(v);
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

/** Ekranda gösterilen maskeli kart numarası: son 8 karakter, 4'lü gruplar. */
export function maskCardToken(token: string): string {
  const tail = token.slice(-8).toUpperCase();
  const grouped = tail.length > 4 ? `${tail.slice(0, tail.length - 4)} ${tail.slice(-4)}` : tail;
  return `•••• ${grouped}`;
}

/** Kasiyere sesli/elle söylenebilecek kısa kod (son 8, 4'lü gruplar, tire ile). */
export function spokenCardCode(token: string): string {
  const tail = token.slice(-8).toUpperCase();
  return tail.length > 4 ? `${tail.slice(0, tail.length - 4)}-${tail.slice(-4)}` : tail;
}

// ───────────────────────────── Çevrimdışı anlık görüntü ─────────────────────────────

export const SNAPSHOT_VERSION = 1;
/** Bayat anlık görüntü gösterilmez (kart iptal/değişmiş olabilir). */
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CardsSnapshot {
  v: number;
  savedAt: number;
  data: MyCardsData;
}

export function snapshotKey(userId: string): string {
  return `qx:my-card:v${SNAPSHOT_VERSION}:${userId}`;
}

/** Yalnız QR için gereken alanlar saklanır (son işlemler ve ürün adları değil). */
export function buildSnapshot(data: MyCardsData, now: number): CardsSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    savedAt: now,
    data: {
      cards: data.cards
        .filter((c) => c.status === 'ACTIVATED')
        .map((c) => ({ ...c, consumptions: [] })),
      stats: data.stats,
    },
  };
}

export function readSnapshot(raw: string | null, now: number): CardsSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const r = rec(parsed);
    if (!r || r.v !== SNAPSHOT_VERSION || typeof r.savedAt !== 'number') return null;
    if (now - r.savedAt > SNAPSHOT_MAX_AGE_MS || r.savedAt > now + 60_000) return null;
    const data = parseCardsResponse({ success: true, ...(rec(r.data) ?? {}) });
    if (data.cards.length === 0) return null;
    return { v: SNAPSHOT_VERSION, savedAt: r.savedAt, data };
  } catch {
    return null;
  }
}
