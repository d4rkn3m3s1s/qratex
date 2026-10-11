import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * PANEL cihaz push aboneliği (bayi / personel / yönetici) — tüketici: `components/dealer/b-ayarlar/use-push-device.ts`.
 * Müşteri cihazları AYRI uçtan kaydolur: `/api/customer/push` (mimari-api B11: iki uç rol ile ayrıştı).
 *
 * defineRoute: rol + oturum durumu/replay (çıplak getServerSession yok), zod gövde, Redis öncelikli
 * oran sınırı, merkezi hata zarfı. Gövde `PushSubscription.toJSON()` biçimindedir.
 */
const PANEL_ROLES = ['DEALER', 'STAFF', 'ADMIN'] as const;

const SubscribeBody = z
  .object({
    endpoint: z.string().url().max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  })
  .strip();

const UnsubscribeBody = z.object({ endpoint: z.string().max(2048).optional() }).strip().optional();

export const POST = defineRoute(
  { name: 'push.subscribe', roles: PANEL_ROLES, schema: SubscribeBody, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: body.endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== user.id) {
      throw new ApiError('CONFLICT', 'Bu tarayıcı bildirim kaydı başka bir hesaba bağlı.');
    }

    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || undefined;
    const pushSubscription = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        userId: user.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
        isActive: true,
        lastUsedAt: new Date(),
      },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      },
      select: { id: true },
    });

    return ok({ message: 'Bildirimler açıldı', subscriptionId: pushSubscription.id }, { legacySpread: true });
  }
);

export const DELETE = defineRoute(
  { name: 'push.unsubscribe', roles: PANEL_ROLES, schema: UnsubscribeBody, rateLimit: 'mutation' },
  async ({ body, user }) => {
    await prisma.pushSubscription.updateMany({
      where: body?.endpoint ? { endpoint: body.endpoint, userId: user.id } : { userId: user.id },
      data: { isActive: false },
    });
    return ok({ message: 'Bildirimler kapatıldı' }, { legacySpread: true });
  }
);
