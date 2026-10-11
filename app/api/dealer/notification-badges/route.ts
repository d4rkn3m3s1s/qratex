import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/notification-badges — bayi kenar çubuğu "Gelen kutusu" rozeti.
 *
 * mimari-api B2/B4: eskiden `['DEALER','ADMIN']` kabul edip ADMIN'in KENDİ kimliğini bayi sayıyordu
 * (anlamsız sıfırlar) ve hata durumunda `200 + sıfırlar` dönüp "okunmamış yok" diye yalan
 * söylüyordu; silinmiş (çöp kutusundaki) geri bildirimler de sayılıyordu. Artık yalnız bayi,
 * yalnız silinmemiş kayıtlar; hata gerçek hata yanıtıdır (istemci rozeti göstermez).
 */
export const GET = defineRoute(
  { name: 'dealer.notification-badges', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => {
    const base = { qrCode: { dealerId: tenant.dealerId }, deletedAt: null };
    const [unreadCount, negativeCount, toxicCount] = await Promise.all([
      prisma.feedback.count({ where: { ...base, dealerReply: null } }),
      prisma.feedback.count({ where: { ...base, sentiment: 'negative' } }),
      prisma.feedback.count({ where: { ...base, isToxic: true } }),
    ]);
    const badgeCount = Math.min(unreadCount + toxicCount, 99);
    return ok({ unreadCount, negativeCount, toxicCount, badgeCount }, { legacySpread: true });
  }
);
