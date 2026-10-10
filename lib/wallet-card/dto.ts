/**
 * Cüzdan → Kartım veri sözleşmesi (BFF `GET /api/customer/wallet/card` ve sunucu ilk render).
 * Saf; istemci ve sunucu ortak kullanır. Açık DTO: yalnız burada adı geçen alanlar yanıta
 * girer (eski uç `include` ile bayi iç notu, tutar, blok gerekçesi gibi alanları sızdırıyordu).
 */
import {
  getLeagueMetaFromRules,
  getNextLeagueMetaFromRules,
  type LeagueRule,
} from '@/lib/league-rules-core';
import {
  birthMonthDay,
  daysUntilBirthday,
  evaluateBirthdayClaim,
  type BirthdayClaimReason,
  type BirthdayRecordLike,
} from '@/lib/birthday';

export type WalletCardStatus = 'ACTIVATED' | 'BLOCKED' | 'UNUSED';

/** Admin karakter testi sentetik kartları (app/api/admin/character-test) müşteriye gösterilmez. */
export const SYNTHETIC_CARD_BLOCK_REASON = '[KARAKTER-TEST]';
/** Müşterinin kendi dondurduğu kart (yalnız bunu kendisi çözebilir; admin bloğunu çözemez). */
export const CUSTOMER_FREEZE_REASON = 'Müşteri tarafından donduruldu';

export interface WalletCard {
  id: string;
  /** Tam token — yalnız kart sahibine döner (QR üretimi için). */
  token: string;
  status: WalletCardStatus;
  /** Kart müşterinin kendi isteğiyle donduruldu (çözebilir). */
  frozenByCustomer: boolean;
  activatedAt: string | null;
  consumptionsCount: number;
  lastUsedAt: string | null;
}

export interface WalletRecentItem {
  id: string;
  createdAt: string;
  dealerName: string | null;
  productName: string | null;
  /** Bu tüketimden deftere yazılan puan; defter kaydı yoksa null (gösterilmez). */
  pointsEarned: number | null;
  reviewed: boolean;
}

export interface WalletLeague {
  key: string;
  name: string;
  minPoints: number;
  maxPoints: number;
}

export interface WalletVip {
  name: string;
  color: string | null;
  icon: string | null;
  /** Geri bildirim ödüllerine uygulanan çarpan (lib/vip-multiplier ile aynı kural). */
  multiplier: number;
  expiresAt: string | null;
}

export interface WalletStatus {
  points: number;
  level: number;
  league: WalletLeague;
  nextLeague: WalletLeague | null;
  /** Bir sonraki lige kalan puan; son ligde null. */
  toNextLeague: number | null;
  /** Mevcut lig içindeki ilerleme (0–100). */
  leagueProgress: number;
  vip: WalletVip | null;
}

export interface WalletBirthday {
  state: 'unset' | 'today' | 'upcoming';
  month: number | null;
  day: number | null;
  daysUntil: number | null;
  bonusAmount: number;
  claim: BirthdayClaimReason;
}

export interface WalletPendingItem {
  id: string;
  createdAt: string;
  dealerName: string | null;
}

export interface WalletCardPayload {
  holderName: string | null;
  cards: WalletCard[];
  status: WalletStatus;
  birthday: WalletBirthday;
  recent: WalletRecentItem[];
  pending: { count: number; items: WalletPendingItem[] };
  wallet: { apple: boolean; google: boolean };
  generatedAt: string;
}

// ───────────────────────────── Sunucu satırı → DTO (saf) ─────────────────────────────

export interface CardRow {
  id: string;
  token: string;
  status: string;
  activatedAt: Date | null;
  blockReason: string | null;
  archivedAt?: Date | null;
  _count: { consumptions: number };
  consumptions: { createdAt: Date }[];
}

function toStatus(raw: string): WalletCardStatus {
  return raw === 'ACTIVATED' || raw === 'BLOCKED' ? raw : 'UNUSED';
}

/** Arşivli ve sentetik kartlar düşer; aktif kartlar önce. */
export function mapCards(rows: readonly CardRow[]): WalletCard[] {
  const rank: Record<WalletCardStatus, number> = { ACTIVATED: 0, BLOCKED: 1, UNUSED: 2 };
  return rows
    .filter((r) => !r.archivedAt && r.blockReason !== SYNTHETIC_CARD_BLOCK_REASON && !!r.token)
    .map((r) => {
      const status = toStatus(r.status);
      return {
        id: r.id,
        token: r.token,
        status,
        frozenByCustomer: status === 'BLOCKED' && r.blockReason === CUSTOMER_FREEZE_REASON,
        activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
        consumptionsCount: Math.max(0, r._count?.consumptions ?? 0),
        lastUsedAt: r.consumptions[0]?.createdAt ? r.consumptions[0].createdAt.toISOString() : null,
      };
    })
    .sort((a, b) => rank[a.status] - rank[b.status]);
}

export function buildLeagueStatus(points: number, rules: readonly LeagueRule[]): Pick<WalletStatus, 'league' | 'nextLeague' | 'toNextLeague' | 'leagueProgress'> {
  const p = Math.max(0, Math.floor(points));
  const list = [...rules];
  const cur = getLeagueMetaFromRules(p, list);
  const next = getNextLeagueMetaFromRules(p, list);
  const span = Math.max(1, (next ? next.minPoints : cur.maxPoints + 1) - cur.minPoints);
  const progress = next ? Math.max(0, Math.min(100, Math.floor(((p - cur.minPoints) / span) * 100))) : 100;
  const pick = (r: LeagueRule): WalletLeague => ({ key: r.key, name: r.name, minPoints: r.minPoints, maxPoints: r.maxPoints });
  return {
    league: pick(cur),
    nextLeague: next ? pick(next) : null,
    toNextLeague: next ? Math.max(0, next.minPoints - p) : null,
    leagueProgress: progress,
  };
}

export interface VipRow {
  tierExpiry: Date | null;
  tier: { name: string; color: string | null; icon: string | null; multiplier: number; isActive: boolean } | null;
}

/**
 * VIP yalnız gerçekten atanmış, etkin ve süresi dolmamış kayıtta gösterilir — çarpanın
 * fiilen uygulandığı koşulların aynısı (`lib/vip-multiplier.ts#getVipMultiplier`).
 * Kayıt yoksa "otomatik yükselirsin" gibi gerçekleşmeyen bir vaat GÖSTERİLMEZ.
 */
export function buildVip(row: VipRow | null | undefined, now: Date): WalletVip | null {
  if (!row?.tier || !row.tier.isActive) return null;
  if (row.tierExpiry && row.tierExpiry.getTime() < now.getTime()) return null;
  const m = Number(row.tier.multiplier);
  return {
    name: row.tier.name,
    color: typeof row.tier.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(row.tier.color) ? row.tier.color : null,
    icon: row.tier.icon || null,
    multiplier: Number.isFinite(m) && m > 1 ? Math.round(m * 100) / 100 : 1,
    expiresAt: row.tierExpiry ? row.tierExpiry.toISOString() : null,
  };
}

export function buildBirthday(record: BirthdayRecordLike | null | undefined, bonusAmount: number, now: Date): WalletBirthday {
  if (!record) {
    return { state: 'unset', month: null, day: null, daysUntil: null, bonusAmount, claim: 'NOT_SET' };
  }
  const decision = evaluateBirthdayClaim(record, now);
  const { month, day } = birthMonthDay(record.birthDate);
  return {
    state: decision.isToday ? 'today' : 'upcoming',
    month,
    day,
    daysUntil: daysUntilBirthday(record.birthDate, now),
    bonusAmount,
    claim: decision.reason,
  };
}

/** Defter satırları → tüketim başına kazanılan puan (yalnız `posted`). */
export function sumPointsBySource(rows: readonly { sourceId: string | null; delta: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.sourceId) continue;
    out.set(r.sourceId, (out.get(r.sourceId) ?? 0) + r.delta);
  }
  return out;
}

// ───────────────────────────── İstemci: yanıt doğrulama ─────────────────────────────

export class WalletContractError extends Error {
  constructor(message = 'Kart yanıtı beklenen biçimde değil') {
    super(message);
    this.name = 'WalletContractError';
  }
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Zarf v2 gövdesi → doğrulanmış yük. `success:false` ya da eksik alan HATA fırlatır
 * (hata ≠ "kartın yok"; eski sayfa hatayı boş durum gibi gösteriyordu).
 */
export function parseWalletCardResponse(body: unknown): WalletCardPayload {
  const root = rec(body);
  if (!root || root.success === false) throw new WalletContractError();
  const data = rec(root.data) ?? root;
  if (!Array.isArray(data.cards) || !rec(data.status) || !rec(data.birthday) || !rec(data.pending)) {
    throw new WalletContractError();
  }
  return data as unknown as WalletCardPayload;
}
