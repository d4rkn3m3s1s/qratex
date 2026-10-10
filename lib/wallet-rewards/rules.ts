/**
 * Ödül cüzdanı saf kuralları (Prisma/DOM/crypto yok — istemci de içe aktarır; jest ile test edilir).
 *
 *  - Ödül kartının durumu tek fonksiyondan türer (`deriveRewardState`): CTA, rozet ve detay
 *    penceresi aynı kaynaktan beslenir; "tükenmiş ödülde Onayla etkin" sınıfı hata kapanır.
 *  - Kutu kademesi içerikten türer (şemada alan yok): kart kesin puanı değil kademeyi gösterir.
 *  - Günlük kutu anahtarı İstanbul takvim günüdür (UTC değil).
 */
import type {
  BoxSource,
  CosmeticRarity,
  CosmeticType,
  PassKind,
  RewardKind,
  RewardState,
  StockInfo,
} from './types';

export const LOW_STOCK_THRESHOLD = 5;
export const NEW_REWARD_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const COSMETIC_PIN_LIMIT = 4;
export const DAILY_BOX_MIN_POINTS = 50;
export const DAILY_BOX_MAX_POINTS = 250;

export interface RewardRules {
  perUserLimit: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Admin formunun `metadata` alanından kampanya kuralları (bozuk değer = kural yok). */
export function parseRewardRules(metadata: unknown): RewardRules {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { perUserLimit: null, validFrom: null, validUntil: null };
  }
  const m = metadata as Record<string, unknown>;
  const limit = m.perUserLimit;
  return {
    perUserLimit: typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : null,
    validFrom: parseDate(m.validFrom),
    validUntil: parseDate(m.validUntil),
  };
}

export function rewardKind(type: unknown): RewardKind {
  const v = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (v === 'digital' || v === 'physical' || v === 'coupon') return v;
  return 'other';
}

/** Stok gösterimi: -1 (ya da negatif) = sınırsız. */
export function stockInfo(stock: number): StockInfo {
  if (!Number.isFinite(stock) || stock < 0) return { kind: 'unlimited', left: null };
  if (stock === 0) return { kind: 'out', left: 0 };
  if (stock <= LOW_STOCK_THRESHOLD) return { kind: 'low', left: stock };
  return { kind: 'ok', left: stock };
}

export interface RewardStateInput {
  cost: number;
  stock: number;
  rules: RewardRules;
  balance: number;
  userClaimCount: number;
  now: Date;
}

/**
 * Öncelik: süresi doldu > henüz başlamadı > kişi başı limit > tükendi > puan yetmiyor > alınabilir.
 * (Alınamayan bir ödülü "puan biriktir" hedefi olarak göstermek yalnız gerçekten alınabilecekse anlamlı.)
 */
export function deriveRewardState(input: RewardStateInput): RewardState {
  const { rules, now } = input;
  if (rules.validUntil && now.getTime() > rules.validUntil.getTime()) return 'expired';
  if (rules.validFrom && now.getTime() < rules.validFrom.getTime()) return 'upcoming';
  if (rules.perUserLimit !== null && input.userClaimCount >= rules.perUserLimit) return 'limitReached';
  if (input.stock === 0) return 'soldOut';
  if (input.balance < input.cost) return 'insufficient';
  return 'available';
}

/** Hedef halkası: puanı henüz yetmeyen (yalnız puan eksik) en ucuz ödül. */
export function pickNextGoal<T extends { id: string; cost: number; state: RewardState }>(rewards: readonly T[]): string | null {
  let best: T | null = null;
  for (const r of rewards) {
    if (r.state !== 'insufficient') continue;
    if (!best || r.cost < best.cost) best = r;
  }
  return best?.id ?? null;
}

/** Görsel mi glif mi: URL/yol → görsel; kısa metin (emoji) → glif. */
export function splitRewardIcon(icon: string | null | undefined): { imageUrl: string | null; glyph: string | null } {
  const raw = typeof icon === 'string' ? icon.trim() : '';
  if (!raw) return { imageUrl: null, glyph: null };
  if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return { imageUrl: raw, glyph: null };
  // Uzun metinler (ör. eski "gift" anahtar kelimeleri) glif olarak basılmaz.
  return { imageUrl: null, glyph: [...raw].length <= 4 ? raw : null };
}

/** Kasada yazılan kodlar: boşluk/küçük harf toleranslı. */
export function normalizeRewardCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]{3}-[A-Z0-9]{4,16}-[A-Z0-9]{2,8}$/.test(v) ? v : null;
}

// ───────────────────────── Kozmetik ─────────────────────────

export const RARITY_RANK: Record<CosmeticRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function cosmeticRarity(value: unknown): CosmeticRarity {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === 'rare' || v === 'epic' || v === 'legendary' ? v : 'common';
}

export function cosmeticType(value: unknown): CosmeticType {
  return value === 'avatar_frame' || value === 'profile_badge' || value === 'profile_background' ? value : 'other';
}

/** Kuşanılabilir türler (oturumda tek aktif). Rozet "vitrine sabitlenir". */
export function isEquippable(type: CosmeticType): boolean {
  return type === 'avatar_frame' || type === 'profile_background';
}

// ───────────────────────── Sürpriz kutu ─────────────────────────

/**
 * Kademe içerikten türer: puan büyüklüğü + kupon. Günlük kutunun 50–250 aralığında dağılım
 * ≈ %40 yaygın, %35 nadir, %20 destansı, %5 efsanevi.
 */
export function boxTier(input: { points: number; couponCode?: string | null }): CosmeticRarity {
  const p = Number.isFinite(input.points) ? Math.max(0, input.points) : 0;
  const hasCoupon = typeof input.couponCode === 'string' && input.couponCode.trim() !== '';
  if (p >= 240) return 'legendary';
  if (p >= 200) return hasCoupon ? 'legendary' : 'epic';
  if (p >= 130) return hasCoupon ? 'epic' : 'rare';
  return hasCoupon ? 'rare' : 'common';
}

export function boxSource(input: { dayKey: string | null }): BoxSource {
  return input.dayKey ? 'daily' : 'gift';
}

// ───────────────────────── Pass kimliği ─────────────────────────

export function parsePassParam(raw: string | null | undefined): { kind: PassKind; id: string } | null {
  if (!raw) return null;
  const m = /^(reward|remedy|box):([A-Za-z0-9_-]{1,64})$/.exec(raw.trim());
  return m ? { kind: m[1] as PassKind, id: m[2] } : null;
}

export function passParam(kind: PassKind, id: string): string {
  return `${kind}:${id}`;
}

/** Telafi başvuru numarası: kimliğin son 8 karakteri (kasada okunur). */
export function remedyReference(offerId: string): string {
  return `TLF-${offerId.slice(-8).toUpperCase()}`;
}
