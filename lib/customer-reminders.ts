import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isChannelEnabled } from '@/lib/notification-prefs';
import { consumptionVoiceHref } from '@/lib/navigation/deep-links';

/**
 * Hatırlatma dürtmeleri müşterinin "Hatırlatmalar" bildirim tercihine (uygulama içi kanal)
 * uyar; her bildirim `data.kind` taşır (`kindToGroup` → 'reminder'). Ayarlar → Bildirimler
 * kataloğu bu gönderimi bu tercihin tüketicisi olarak kaydeder (lib/customer-settings).
 *
 * Oyunlaştırma-ekonomi D3 düzeltmeleri (retention döngüsünün tetik halkası):
 *  - Kapsam: eskiden `take: 1000` (sırasız) — 1000. müşteriden sonrası HİÇ dürtülmüyordu;
 *    askıdaki/anonimleştirilmiş/demo hesaplar da dürtülüyordu. Artık uygun müşterilerin
 *    TAMAMI imleçle sayfalanır.
 *  - Sorgu sayısı: müşteri başına 3–5 sıralı sorgu (1000 müşteride ~4000 gidiş-dönüş, günlük
 *    işin 25 sn bütçesini aşıyordu) yerine sayfa başına sabit 4 küme sorgusu + toplu yazım.
 *  - Tekilleştirme: eskiden yalnız kullanıcının EN SON bildirimine bakılıyordu → arada başka
 *    bir bildirim gelmişse aynı hatırlatma bekleme süresi dolmadan tekrar gönderiliyordu.
 *    Artık pencere içindeki aynı türdeki bildirimlerin hepsine bakılır.
 * Seri tehlikede / açılmamış kutu dürtmeleri: lib/gamification-nudges.ts (aynı günlük iş).
 */
const REMINDER_GROUP = 'reminder';

const INACTIVE_DAYS = 14;
const INACTIVE_COOLDOWN_DAYS = 7;
const MISSING_COMMENT_LOOKBACK_DAYS = 7;
const MISSING_COMMENT_COOLDOWN_HOURS = 36;
const PAGE = 500;

export const INACTIVE_KIND = 'reminder-inactive-feedback';
export const MISSING_COMMENT_KIND = 'reminder-missing-comment';

const ELIGIBLE_CUSTOMER: Prisma.UserWhereInput = {
  role: 'CUSTOMER',
  suspendedAt: null,
  anonymizedAt: null,
  isDemo: false,
};

type Db = typeof prisma;

/** Saf: bir sayfa müşteri için hangi hatırlatmaların gideceği (test edilir). */
export function planReminders(input: {
  userIds: readonly string[];
  lastFeedbackAt: ReadonlyMap<string, Date>;
  pendingConsumption: ReadonlyMap<string, string>;
  recentInactive: ReadonlySet<string>;
  recentMissing: ReadonlySet<string>;
  inactiveCutoff: Date;
}): { inactive: string[]; missing: Array<{ userId: string; consumptionId: string }> } {
  const inactive: string[] = [];
  const missing: Array<{ userId: string; consumptionId: string }> = [];
  for (const id of input.userIds) {
    const last = input.lastFeedbackAt.get(id);
    if ((!last || last < input.inactiveCutoff) && !input.recentInactive.has(id)) inactive.push(id);
    const cid = input.pendingConsumption.get(id);
    if (cid && !input.recentMissing.has(`${id}:${cid}`)) missing.push({ userId: id, consumptionId: cid });
  }
  return { inactive, missing };
}

function later(a: Date | undefined, b: Date | null | undefined): Date | undefined {
  if (!b) return a;
  return !a || b > a ? b : a;
}

export async function runCustomerReminderNudges(db: Db = prisma, now: Date = new Date()): Promise<{
  customersChecked: number;
  inactiveNudgesSent: number;
  missingCommentNudgesSent: number;
}> {
  const ms = (h: number) => h * 3_600_000;
  const inactiveCutoff = new Date(now.getTime() - ms(24 * INACTIVE_DAYS));
  const inactiveCooldown = new Date(now.getTime() - ms(24 * INACTIVE_COOLDOWN_DAYS));
  const missingLookback = new Date(now.getTime() - ms(24 * MISSING_COMMENT_LOOKBACK_DAYS));
  const missingCooldown = new Date(now.getTime() - ms(MISSING_COMMENT_COOLDOWN_HOURS));

  let cursor: string | undefined;
  let customersChecked = 0;
  let inactiveNudgesSent = 0;
  let missingCommentNudgesSent = 0;

  for (;;) {
    const page = await db.user.findMany({
      where: ELIGIBLE_CUSTOMER,
      select: { id: true, notificationPrefs: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    customersChecked += page.length;

    // Hatırlatmaları kapatan müşteri için hiç sorgu/bildirim yok.
    const ids = page.filter((c) => isChannelEnabled(c.notificationPrefs, REMINDER_GROUP, 'app')).map((c) => c.id);
    if (ids.length > 0) {
      const [lastQr, lastReview, pending, recent] = await Promise.all([
        db.feedback.groupBy({ by: ['userId'], where: { userId: { in: ids }, deletedAt: null }, _max: { createdAt: true } }),
        db.consumptionReview.groupBy({
          by: ['customerId'],
          where: { customerId: { in: ids }, deletedAt: null },
          _max: { createdAt: true },
        }),
        db.consumptionReview.findMany({
          where: {
            deletedAt: null,
            customerId: { in: ids },
            createdAt: { gte: missingLookback },
            OR: [{ text: null }, { text: '' }],
          },
          orderBy: { createdAt: 'desc' },
          select: { customerId: true, consumptionId: true },
        }),
        db.notification.findMany({
          where: {
            userId: { in: ids },
            createdAt: { gte: inactiveCooldown < missingCooldown ? inactiveCooldown : missingCooldown },
            OR: [
              { data: { path: ['kind'], equals: INACTIVE_KIND } },
              { data: { path: ['kind'], equals: MISSING_COMMENT_KIND } },
            ],
          },
          select: { userId: true, data: true, createdAt: true },
        }),
      ]);

      const lastFeedbackAt = new Map<string, Date>();
      const touch = (userId: string | null, at: Date | null | undefined) => {
        if (!userId) return;
        const v = later(lastFeedbackAt.get(userId), at);
        if (v) lastFeedbackAt.set(userId, v);
      };
      for (const r of lastQr) touch(r.userId, r._max.createdAt);
      for (const r of lastReview) touch(r.customerId, r._max.createdAt);
      // En yeni yorumsuz değerlendirme (sıralı sorgudan müşteri başına ilki).
      const pendingConsumption = new Map<string, string>();
      for (const r of pending) if (!pendingConsumption.has(r.customerId)) pendingConsumption.set(r.customerId, r.consumptionId);

      const recentInactive = new Set<string>();
      const recentMissing = new Set<string>();
      for (const n of recent) {
        const d = (n.data ?? {}) as { kind?: unknown; nudgeType?: unknown };
        if (d.kind === INACTIVE_KIND && n.createdAt >= inactiveCooldown) recentInactive.add(n.userId);
        if (d.kind === MISSING_COMMENT_KIND && n.createdAt >= missingCooldown && typeof d.nudgeType === 'string') {
          const cid = d.nudgeType.replace(/^rated_without_comment:/, '');
          recentMissing.add(`${n.userId}:${cid}`);
        }
      }

      const plan = planReminders({ userIds: ids, lastFeedbackAt, pendingConsumption, recentInactive, recentMissing, inactiveCutoff });
      const data: Prisma.NotificationCreateManyInput[] = [
        ...plan.inactive.map((userId) => ({
          userId,
          type: 'info',
          title: '💬 Senden haber almayalı biraz oldu',
          message:
            'Uzun süredir geri bildirim paylaşmadın. 30 saniyede kısa bir değerlendirme bırak, deneyimini birlikte iyileştirelim.',
          data: {
            kind: INACTIVE_KIND,
            module: 'customer_reminder',
            nudgeType: 'inactive_feedback',
            ctaPath: '/customer/wallet/activity',
          },
        })),
        ...plan.missing.map(({ userId, consumptionId }) => ({
          userId,
          type: 'info',
          title: '✍️ Puanın çok değerli, kısa yorumun daha da değerli',
          message: 'Puan verdin ama yorum kısmı boş kaldı. Kısa bir not eklersen ekip sorunu daha hızlı çözer.',
          data: {
            kind: MISSING_COMMENT_KIND,
            module: 'customer_reminder',
            nudgeType: `rated_without_comment:${consumptionId}`,
            ctaPath: consumptionVoiceHref(consumptionId),
          },
        })),
      ];
      if (data.length > 0) {
        await db.notification.createMany({ data });
        inactiveNudgesSent += plan.inactive.length;
        missingCommentNudgesSent += plan.missing.length;
      }
    }

    if (page.length < PAGE) break;
  }

  return { customersChecked, inactiveNudgesSent, missingCommentNudgesSent };
}
