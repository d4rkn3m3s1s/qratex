import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { encodeNativeEndpoint, isValidNativeToken, NATIVE_KEY_PLACEHOLDER } from '@/lib/push-native';

export const dynamic = 'force-dynamic';

/**
 * NATIVE cihaz push kaydı (Capacitor: Android → FCM, iOS → APNs) — tüm oturumlu roller.
 * İstemci: `lib/native/push-client.ts`. Jeton `PushSubscription.endpoint` alanına
 * `native:<fcm|apns>:<token>` olarak yazılır (şema genişletmesi bekleniyor; bkz. lib/push-native.ts).
 *
 * Aynı jeton başka hesaba bağlıysa YENİ hesaba devredilir: native jeton cihazdır ve cihazda en son
 * oturum açan kullanıcının bildirimleri gelmelidir (çıkışta DELETE ile zaten bırakılır).
 */
const ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;
/** Hesap başına etkin native cihaz tavanı (her bildirim hepsine gider). */
const MAX_ACTIVE_NATIVE = 10;

const RegisterBody = z
  .object({
    platform: z.enum(['android', 'ios']),
    token: z.string().refine(isValidNativeToken, 'Geçersiz cihaz jetonu'),
  })
  .strip();

const UnregisterBody = z
  .object({ platform: z.enum(['android', 'ios']).optional(), token: z.string().max(1024).optional() })
  .strip()
  .optional();

const toProvider = (p: 'android' | 'ios') => (p === 'ios' ? 'apns' : 'fcm');

export const POST = defineRoute(
  { name: 'push.native.register', roles: ROLES, schema: RegisterBody, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    const endpoint = encodeNativeEndpoint(toProvider(body.platform), body.token);
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || undefined;
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: user.id, isActive: true, lastUsedAt: new Date(), userAgent },
      create: { userId: user.id, endpoint, p256dh: NATIVE_KEY_PLACEHOLDER, auth: NATIVE_KEY_PLACEHOLDER, userAgent },
      select: { id: true },
    });

    // Tavan: en eski native kayıtları pasifleştir.
    const active = await prisma.pushSubscription.findMany({
      where: { userId: user.id, isActive: true, endpoint: { startsWith: 'native:' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (active.length > MAX_ACTIVE_NATIVE) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: active.slice(MAX_ACTIVE_NATIVE).map((a) => a.id) } },
        data: { isActive: false },
      });
    }

    return ok({ message: 'Bildirimler açıldı', subscriptionId: sub.id });
  }
);

export const DELETE = defineRoute(
  { name: 'push.native.unregister', roles: ROLES, schema: UnregisterBody, rateLimit: 'mutation' },
  async ({ body, user }) => {
    const where =
      body?.token && body.platform
        ? { userId: user.id, endpoint: encodeNativeEndpoint(toProvider(body.platform), body.token) }
        : { userId: user.id, endpoint: { startsWith: 'native:' } };
    await prisma.pushSubscription.updateMany({ where, data: { isActive: false } });
    return ok({ message: 'Bildirimler kapatıldı' });
  }
);
