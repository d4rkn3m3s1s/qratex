import { prisma } from '@/lib/prisma';
import { isChannelEnabled } from '@/lib/notification-prefs';
import { consumptionVoiceHref } from '@/lib/navigation/deep-links';

/**
 * Hatırlatma dürtmeleri müşterinin "Hatırlatmalar" bildirim tercihine (uygulama içi kanal)
 * uyar; her bildirim `data.kind` taşır (`kindToGroup` → 'reminder'). Ayarlar → Bildirimler
 * kataloğu bu gönderimi bu tercihin tüketicisi olarak kaydeder (lib/customer-settings).
 */
const REMINDER_GROUP = 'reminder';

const INACTIVE_DAYS = 14;
const INACTIVE_COOLDOWN_DAYS = 7;
const MISSING_COMMENT_LOOKBACK_DAYS = 7;
const MISSING_COMMENT_COOLDOWN_HOURS = 36;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function hasRecentNudge(userId: string, nudgeType: string, since: Date): Promise<boolean> {
  const recent = await prisma.notification.findFirst({
    where: {
      userId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: { data: true },
  });
  if (!recent?.data || typeof recent.data !== 'object' || recent.data === null) return false;
  const payload = recent.data as Record<string, unknown>;
  return payload.nudgeType === nudgeType;
}

async function createInactiveFeedbackNudge(userId: string): Promise<boolean> {
  const recentlySent = await hasRecentNudge(
    userId,
    'inactive_feedback',
    daysAgo(INACTIVE_COOLDOWN_DAYS)
  );
  if (recentlySent) return false;

  await prisma.notification.create({
    data: {
      userId,
      type: 'info',
      title: '💬 Senden haber almayalı biraz oldu',
      message:
        'Uzun süredir geri bildirim paylaşmadın. 30 saniyede kısa bir değerlendirme bırak, deneyimini birlikte iyileştirelim.',
      data: {
        kind: 'reminder-inactive-feedback',
        module: 'customer_reminder',
        nudgeType: 'inactive_feedback',
        ctaPath: '/customer/wallet/activity',
      },
    },
  });
  return true;
}

async function createMissingCommentNudge(
  userId: string,
  pendingConsumptionId: string
): Promise<boolean> {
  const recentlySent = await hasRecentNudge(
    userId,
    `rated_without_comment:${pendingConsumptionId}`,
    hoursAgo(MISSING_COMMENT_COOLDOWN_HOURS)
  );
  if (recentlySent) return false;

  await prisma.notification.create({
    data: {
      userId,
      type: 'info',
      title: '✍️ Puanın çok değerli, kısa yorumun daha da değerli',
      message:
        'Puan verdin ama yorum kısmı boş kaldı. Kısa bir not eklersen ekip sorunu daha hızlı çözer.',
      data: {
        kind: 'reminder-missing-comment',
        module: 'customer_reminder',
        nudgeType: `rated_without_comment:${pendingConsumptionId}`,
        ctaPath: consumptionVoiceHref(pendingConsumptionId),
      },
    },
  });
  return true;
}

export async function runCustomerReminderNudges(): Promise<{
  customersChecked: number;
  inactiveNudgesSent: number;
  missingCommentNudgesSent: number;
}> {
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    select: { id: true, notificationPrefs: true },
    take: 1000,
  });

  let inactiveNudgesSent = 0;
  let missingCommentNudgesSent = 0;
  const inactiveCutoff = daysAgo(INACTIVE_DAYS);

  for (const customer of customers) {
    // Kullanıcı hatırlatmaları kapattıysa bu müşteri için hiç sorgu/bildirim yok.
    if (!isChannelEnabled(customer.notificationPrefs, REMINDER_GROUP, 'app')) continue;
    const [lastQrFeedback, lastConsumptionReview, pendingReviewedWithoutComment] = await Promise.all([
      prisma.feedback.findFirst({
        where: { deletedAt: null, userId: customer.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.consumptionReview.findFirst({
        where: { deletedAt: null, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.consumptionReview.findFirst({
        where: {
          deletedAt: null,
          customerId: customer.id,
          createdAt: { gte: daysAgo(MISSING_COMMENT_LOOKBACK_DAYS) },
          OR: [{ text: null }, { text: '' }],
        },
        orderBy: { createdAt: 'desc' },
        select: { consumptionId: true },
      }),
    ]);

    const lastFeedbackDate = [lastQrFeedback?.createdAt, lastConsumptionReview?.createdAt]
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!lastFeedbackDate || lastFeedbackDate < inactiveCutoff) {
      if (await createInactiveFeedbackNudge(customer.id)) {
        inactiveNudgesSent++;
      }
    }

    if (pendingReviewedWithoutComment?.consumptionId) {
      if (
        await createMissingCommentNudge(
          customer.id,
          pendingReviewedWithoutComment.consumptionId
        )
      ) {
        missingCommentNudgesSent++;
      }
    }
  }

  return {
    customersChecked: customers.length,
    inactiveNudgesSent,
    missingCommentNudgesSent,
  };
}
