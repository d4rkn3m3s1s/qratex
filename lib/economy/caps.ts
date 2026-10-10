/**
 * Ekonomi tavanları — TEK kaynak.
 *
 * Kategori tavanları kullanıcı başına günlük / haftalık (ve gerekiyorsa aktör başına
 * günlük) uygulanır. Kullanım, aynı transaction içinde yazılan `points_credited`
 * analytics olaylarından sayılır: hem eski yollar (creditPointsAndXp + elle olay) hem
 * `mintPoints` bu olayı yazdığından geçiş döneminde iki dünya tek kovada toplanır.
 * Ledger tam göç ettikten sonra yalnız `sumEarnedInWindow` değişir (F1.3 "cap'i ledger'a taşı").
 *
 * Gün/hafta sınırı lib/timezone'dan (UTC) — lib/points-caps.ts ile birebir aynı sınır.
 */
import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { startOfDayUTC, startOfWeekUTC } from '@/lib/timezone';

type CapsDb = Prisma.TransactionClient | typeof prisma;

export interface CapRule {
  /** Kullanıcı başına UTC günlük puan tavanı. */
  daily?: number;
  /** Kullanıcı başına UTC haftalık (Pazartesi başlangıçlı) puan tavanı. */
  weekly?: number;
  /** Kullanıcı × aktör (ör. müşteri × bayi) başına günlük tavan. */
  perActorDaily?: number;
  /** true → aktör (actorId) olmadan bu kategoride puan basılamaz. */
  requiresActor?: boolean;
  /** Tavana sayılan `points_credited.category` değerleri (aynı kovayı paylaşanlar). */
  countCategories: readonly string[];
  /** İnsan okuması için (README ve admin paneli). */
  description: string;
}

/** Geri bildirim + tüketim yorumu: lib/points-caps.ts'nin tarihsel değerleri (madde 42). */
export const FEEDBACK_DAILY_CAP = 500;
export const FEEDBACK_WEEKLY_CAP = 2000;

/**
 * Mini oyunlar (P0-17): bir oyun 120–170 puan veriyor ve 20+ oyun var → tavansızken
 * günde ~3.250 puan. 600/gün ≈ 4 tam ödüllü oyun; haftalık 3.000.
 */
export const GAME_DAILY_CAP = 600;
export const GAME_WEEKLY_CAP = 3000;

/**
 * Bayi pasif (tüketim) puanı (P0-13/P0-21): tek tüketim en fazla ~50 × çarpan.
 * Müşteri × bayi × gün 300, müşteri × gün (tüm bayiler) 600.
 */
export const DEALER_PASSIVE_PER_DEALER_DAILY_CAP = 300;
export const DEALER_PASSIVE_DAILY_CAP = 600;

const DEALER_PASSIVE_RULE: CapRule = {
  daily: DEALER_PASSIVE_DAILY_CAP,
  perActorDaily: DEALER_PASSIVE_PER_DEALER_DAILY_CAP,
  requiresActor: true,
  countCategories: ['dealer_passive', 'consumption', 'consumption_passive'],
  description: 'Bayi pasif tüketim puanı: müşteri × bayi × gün 300, müşteri × gün 600',
};

export const ECONOMY_CAPS = {
  feedback: {
    daily: FEEDBACK_DAILY_CAP,
    weekly: FEEDBACK_WEEKLY_CAP,
    countCategories: ['feedback'],
    description: 'Geri bildirim ve tüketim yorumu: günde 500, haftada 2.000',
  },
  game: {
    daily: GAME_DAILY_CAP,
    weekly: GAME_WEEKLY_CAP,
    countCategories: ['game'],
    description: 'Mini oyun ödülleri: günde 600, haftada 3.000',
  },
  dealer_passive: DEALER_PASSIVE_RULE,
  // Eşanlamlı: aynı kova (tüketim pasif puanı farklı adlarla çağrılabiliyor).
  consumption: DEALER_PASSIVE_RULE,
} as const satisfies Record<string, CapRule>;

export type CapCategory = keyof typeof ECONOMY_CAPS;

/** Kategori tavanı tanımlı mı? Tanımlı değilse (rozet, görev, escrow iadesi…) tavan yok. */
export function getCapRule(category: string | null | undefined): CapRule | null {
  if (!category) return null;
  return Object.prototype.hasOwnProperty.call(ECONOMY_CAPS, category)
    ? (ECONOMY_CAPS as Record<string, CapRule>)[category]
    : null;
}

/**
 * Tek seferlik bir mint'in mutlak üst sınırı. Hiçbir meşru kaynak tek seferde bunu aşmaz
 * (en büyük: karakter rozeti 10.000, admin düzeltmesi 100.000). Yanlış yapılandırılmış
 * bir matris ya da çarpan şelalesi (P0-21) burada fail-closed durur.
 */
export const MAX_SINGLE_MINT = 100_000;
export const MAX_SINGLE_XP = 100_000;

/** Admin manuel düzeltme sınırları (P0-19). */
export const ADMIN_ADJUST_LIMITS = {
  /** Tek işlemde |delta| üst sınırı. */
  perOperation: 100_000,
  /** Aynı kullanıcıya bir günde admin'lerin toplam POZİTİF düzeltmesi. */
  dailyPerUser: 200_000,
  /** Bu eşiğin üstü ikinci bir admin onayı ister (4-göz). */
  secondApprovalAbove: 10_000,
  /** Gerekçe uzunluğu. */
  reasonMin: 5,
  reasonMax: 500,
} as const;

export interface CapDecision {
  category: string;
  requested: number;
  granted: number;
  capped: boolean;
  earnedToday: number;
  earnedThisWeek: number | null;
  earnedTodayFromActor: number | null;
}

function pointsOf(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const p = (data as { points?: unknown }).points;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 0;
}

function actorOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const a = (data as { actorId?: unknown }).actorId;
  return typeof a === 'string' ? a : null;
}

/**
 * Tek sorguyla (pencerenin en eski başlangıcından) günlük, haftalık ve aktör-günlük
 * kazanımı hesaplar. Hafta başı her zaman gün başına eşit ya da öncedir.
 */
export async function sumEarnedInWindow(
  db: CapsDb,
  params: { userId: string; rule: CapRule; actorId?: string | null; now?: Date }
): Promise<{ today: number; week: number; todayFromActor: number }> {
  const now = params.now ?? new Date();
  const dayStart = startOfDayUTC(now);
  const windowStart = params.rule.weekly ? startOfWeekUTC(now) : dayStart;

  const rows = await db.analyticsEvent.findMany({
    where: {
      userId: params.userId,
      event: 'points_credited',
      category: { in: [...params.rule.countCategories] },
      createdAt: { gte: windowStart },
    },
    select: { data: true, createdAt: true },
  });

  let today = 0;
  let week = 0;
  let todayFromActor = 0;
  for (const row of rows) {
    const p = pointsOf(row.data);
    if (p <= 0) continue;
    week += p;
    const isToday = row.createdAt instanceof Date ? row.createdAt >= dayStart : true;
    if (isToday) {
      today += p;
      if (params.actorId && actorOf(row.data) === params.actorId) todayFromActor += p;
    }
  }
  return { today, week, todayFromActor };
}

/**
 * Verilecek puanı kategorinin tavanlarına göre kısaltır (negatif dönmez).
 * Eşzamanlılık: çağıran (mintPoints) kullanıcı satırını FOR UPDATE ile kilitledikten
 * SONRA çağırmalı; yoksa iki paralel istek aynı "kalan"ı görür.
 */
export async function applyCategoryCap(
  db: CapsDb,
  params: { userId: string; category: string; points: number; actorId?: string | null; now?: Date }
): Promise<CapDecision> {
  const requested = Math.max(0, Math.floor(params.points));
  const rule = getCapRule(params.category);
  if (!rule || requested === 0) {
    return {
      category: params.category,
      requested,
      granted: requested,
      capped: false,
      earnedToday: 0,
      earnedThisWeek: null,
      earnedTodayFromActor: null,
    };
  }

  const earned = await sumEarnedInWindow(db, {
    userId: params.userId,
    rule,
    actorId: params.actorId,
    now: params.now,
  });

  let granted = requested;
  if (rule.daily !== undefined) granted = Math.min(granted, Math.max(0, rule.daily - earned.today));
  if (rule.weekly !== undefined) granted = Math.min(granted, Math.max(0, rule.weekly - earned.week));
  if (rule.perActorDaily !== undefined && params.actorId) {
    granted = Math.min(granted, Math.max(0, rule.perActorDaily - earned.todayFromActor));
  }

  return {
    category: params.category,
    requested,
    granted,
    capped: granted < requested,
    earnedToday: earned.today,
    earnedThisWeek: rule.weekly !== undefined ? earned.week : null,
    earnedTodayFromActor: params.actorId && rule.perActorDaily !== undefined ? earned.todayFromActor : null,
  };
}
