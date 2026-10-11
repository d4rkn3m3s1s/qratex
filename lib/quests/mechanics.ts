/**
 * Görev mekanikleri sözlüğü — hangi görev nasıl ilerler, kullanıcı ne yapmalı (CTA) ve
 * ilerleme hangi kaynaktan sayılır. Bulgu 2 (ilerleme motoru yok) + Bulgu 13 (nasıl ilerlerim).
 *
 * İki ilerleme modeli var:
 *  - `live`  → ilerleme dönem penceresi içindeki KAYNAK kayıtlardan sayılır (geri bildirim,
 *              tüketim yorumu, ziyaret, davet). Sunucu otoriter; olay kaçırma/çift sayma yok,
 *              geriye dönük doğru. Yalnız okuma — GET hiçbir şey yazmaz.
 *  - `stored`→ ilerlemeyi başka bir motor `UserQuest.progress`'e yazar (ziyaret görevi:
 *              lib/visit-missions.ts, başarımlar: lib/achievements.ts — ikisi de OTOMATİK öder).
 *  - `manual`→ admin formundaki "Manuel" mekanik: ilerletecek bir motor YOK. Kullanıcıya yalnız
 *              mevcut bir ilerleme satırı varsa gösterilir (bkz. lib/quests/board.ts).
 */
import type { Prisma } from '@prisma/client';
import { ACHIEVEMENT_QUEST_IDS } from './reward';

export const LIVE_MECHANICS = [
  'give_feedback',
  'feedback_with_photo',
  'detailed_feedback',
  'visit_businesses',
  'referral',
] as const;
export type LiveMechanic = (typeof LIVE_MECHANICS)[number];

export type QuestMechanic = LiveMechanic | 'visit_category' | 'achievement' | 'custom';
export type QuestTracking = 'live' | 'stored' | 'manual';

const LIVE_SET: ReadonlySet<string> = new Set(LIVE_MECHANICS);
const ACHIEVEMENT_SET: ReadonlySet<string> = new Set(ACHIEVEMENT_QUEST_IDS);

/** Ayrıntılı yorum için varsayılan en az karakter (tohum metni: "100+ karakter"). */
export const DETAILED_MIN_LENGTH = 100;

export interface ParsedRequirement {
  type: string;
  count: number;
  category?: string;
  minLength: number;
}

export function parseRequirement(raw: unknown): ParsedRequirement {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const count = typeof o.count === 'number' && Number.isFinite(o.count) && o.count > 0 ? Math.floor(o.count) : 1;
  const minLength =
    typeof o.minLength === 'number' && Number.isFinite(o.minLength) && o.minLength > 0
      ? Math.min(5000, Math.floor(o.minLength))
      : DETAILED_MIN_LENGTH;
  return {
    type: typeof o.type === 'string' ? o.type.trim().toLowerCase() : '',
    count: Math.min(count, 10_000),
    category: typeof o.category === 'string' && o.category.trim() ? o.category.trim() : undefined,
    minLength,
  };
}

export function resolveMechanic(quest: { id: string; requirement: unknown }): QuestMechanic {
  if (ACHIEVEMENT_SET.has(quest.id)) return 'achievement';
  const { type } = parseRequirement(quest.requirement);
  if (type === 'visit_category') return 'visit_category';
  if (LIVE_SET.has(type)) return type as LiveMechanic;
  return 'custom';
}

export function mechanicTracking(mechanic: QuestMechanic): QuestTracking {
  if (LIVE_SET.has(mechanic)) return 'live';
  if (mechanic === 'visit_category' || mechanic === 'achievement') return 'stored';
  return 'manual';
}

/**
 * Kullanıcıyı ilerleyeceği yere götüren bağlantı. Etiket istemcide (TR/EN) `cta` koduyla seçilir.
 * Rotalar bugün var olan müşteri rotalarıdır (IA geçişinde yönlendirmelerle yeni yere gider).
 */
export type QuestCtaKind = 'scan' | 'nearby' | 'referral' | 'shop' | 'settings';
export interface QuestCta {
  kind: QuestCtaKind;
  href: string;
}

const CTA: Record<QuestCtaKind, QuestCta> = {
  scan: { kind: 'scan', href: '/customer/scan' },
  nearby: { kind: 'nearby', href: '/customer/nearby' },
  referral: { kind: 'referral', href: '/customer/referral' },
  shop: { kind: 'shop', href: '/customer/shop' },
  settings: { kind: 'settings', href: '/customer/settings' },
};

const ACHIEVEMENT_CTA: Record<string, QuestCtaKind> = {
  'quest-color-wizard': 'settings',
  'quest-gift-master': 'shop',
  'quest-cosmetic-collector': 'shop',
  'quest-showcase-master': 'settings',
};

export function mechanicCta(mechanic: QuestMechanic, questId: string): QuestCta | null {
  switch (mechanic) {
    case 'give_feedback':
    case 'feedback_with_photo':
    case 'detailed_feedback':
      return CTA.scan;
    case 'visit_businesses':
    case 'visit_category':
      return CTA.nearby;
    case 'referral':
      return CTA.referral;
    case 'achievement': {
      const kind = ACHIEVEMENT_CTA[questId];
      return kind ? CTA[kind] : null;
    }
    default:
      return null;
  }
}

// ───────────────────────────── Sayım ─────────────────────────────

/** Sayımın okuduğu Prisma yüzeyi (kök istemci ya da tx; test için dar tip). */
export type MechanicsDb = Pick<
  Prisma.TransactionClient,
  'feedback' | 'consumptionReview' | 'consumption' | 'referral'
>;

export interface CountWindow {
  from: Date;
  to: Date;
}

/** JS tarafında süzülen sayımlarda okunacak en fazla satır (pencere kısa olduğu için bol). */
const SCAN_LIMIT = 500;

function hasMedia(media: unknown): boolean {
  return Array.isArray(media) && media.some((m) => typeof m === 'string' ? m.trim().length > 0 : !!m);
}

/**
 * Göreve sayılan geri bildirim: silinmemiş ve GÜVEN İŞARETSİZ. `trustFlagged` hem işletme
 * içinden (personel/sahip kendi mekânına — puan almaz) hem güven motorunun şüpheli bulduğu
 * yorumları kapsar; sayılsaydı puan basmayan yorumlar görev ödülüyle puana çevrilirdi
 * (lig ve klan hedefiyle aynı kural).
 */
export const COUNTED_FEEDBACK = { deletedAt: null, trustFlagged: false } as const;

/**
 * Bir mekaniğin pencere içindeki ilerlemesi. "Geri bildirim" hem QR geri bildirimini hem tüketim
 * yorumunu kapsar (ikisi de müşterinin işletmeye sesi). Silinmiş (moderasyon) kayıtlar sayılmaz.
 */
export async function countMechanicProgress(
  db: MechanicsDb,
  userId: string,
  mechanic: LiveMechanic,
  window: CountWindow,
  req: Pick<ParsedRequirement, 'minLength'> = { minLength: DETAILED_MIN_LENGTH }
): Promise<number> {
  if (window.to.getTime() <= window.from.getTime()) return 0;
  const createdAt = { gte: window.from, lt: window.to };

  switch (mechanic) {
    case 'give_feedback': {
      const [fb, rv] = await Promise.all([
        db.feedback.count({ where: { ...COUNTED_FEEDBACK, userId, createdAt } }),
        db.consumptionReview.count({ where: { customerId: userId, deletedAt: null, createdAt } }),
      ]);
      return fb + rv;
    }
    case 'feedback_with_photo': {
      const rows = await db.feedback.findMany({
        where: { ...COUNTED_FEEDBACK, userId, createdAt },
        select: { media: true },
        take: SCAN_LIMIT,
      });
      return rows.filter((r) => hasMedia(r.media)).length;
    }
    case 'detailed_feedback': {
      const min = req.minLength;
      const [fb, rv] = await Promise.all([
        db.feedback.findMany({
          where: { ...COUNTED_FEEDBACK, userId, createdAt, text: { not: null } },
          select: { text: true },
          take: SCAN_LIMIT,
        }),
        db.consumptionReview.findMany({
          where: { customerId: userId, deletedAt: null, createdAt, text: { not: null } },
          select: { text: true },
          take: SCAN_LIMIT,
        }),
      ]);
      const long = (t: string | null) => (t ?? '').trim().length >= min;
      return fb.filter((r) => long(r.text)).length + rv.filter((r) => long(r.text)).length;
    }
    case 'visit_businesses': {
      const [fb, cons] = await Promise.all([
        db.feedback.findMany({
          where: { ...COUNTED_FEEDBACK, userId, createdAt },
          select: { qrCode: { select: { dealerId: true } } },
          take: SCAN_LIMIT,
        }),
        db.consumption.findMany({
          where: { customerId: userId, createdAt },
          select: { dealerId: true },
          distinct: ['dealerId'],
          take: SCAN_LIMIT,
        }),
      ]);
      const dealers = new Set<string>();
      for (const r of fb) if (r.qrCode?.dealerId) dealers.add(r.qrCode.dealerId);
      for (const r of cons) if (r.dealerId) dealers.add(r.dealerId);
      return dealers.size;
    }
    case 'referral':
      // Yalnız TAMAMLANMIŞ davetler (P0: kayıt → PENDING; ilk gerçek etkileşimde COMPLETED).
      return db.referral.count({
        where: { referrerId: userId, status: 'COMPLETED', completedAt: { gte: window.from, lt: window.to } },
      });
    default:
      return 0;
  }
}
