import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { encodeNativeEndpoint, isValidNativeToken, NATIVE_KEY_PLACEHOLDER } from '@/lib/push-native';

export const dynamic = 'force-dynamic';

/**
 * NATIVE cihaz push kaydı (Capacitor: Android → FCM, iOS → APNs) — tüm oturumlu roller.
 * İstemci: `lib/native/push-client.ts`. Jeton `PushSubscription.endpoint` alanına
 * `native:<fcm|apns>:<token>` olarak yazılır (şema genişletmesi bekleniyor; bkz. lib/push-native.ts).
 *
 * Aynı jeton başka hesaba bağlıysa YALNIZ taze girişle (son 15 dk) yeni hesaba devredilir: tek cihaz =
 * tek aktif kullanıcı, en son doğrulanmış giriş kazanır. Çıkışta istemci DELETE çağırır; oturum iptalinde
 * (sessionVersion artışı) sunucu jetonları düşürür (lib/push-native-revoke.ts).
 */
const ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;
/** Hesap başına etkin native cihaz tavanı (her bildirim hepsine gider). */
const MAX_ACTIVE_NATIVE = 10;
/** Kardeş uç (/api/customer/push) ile aynı: kullanıcı başına saatte 20 kayıt. */
const REGISTER_RATE_LIMIT = { max: 20, windowMs: 60 * 60_000, by: 'user' } as const;
/** Başka hesaba bağlı jetonu devralmak için girişin bu kadar yeni olması gerekir. */
const NATIVE_TAKEOVER_FRESH_MS = 15 * 60_000;

function isFreshAuth(session: unknown, now: number): boolean {
  const authAt = (session as { authAt?: unknown } | null)?.authAt;
  return typeof authAt === 'number' && authAt > 0 && now - authAt <= NATIVE_TAKEOVER_FRESH_MS && authAt <= now + 60_000;
}

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
  { name: 'push.native.register', roles: ROLES, schema: RegisterBody, rateLimit: REGISTER_RATE_LIMIT },
  async ({ body, user, session, request }) => {
    const endpoint = encodeNativeEndpoint(toProvider(body.platform), body.token);
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || undefined;

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint }, select: { id: true, userId: true } });
    if (existing && existing.userId !== user.id) {
      // Tek cihaz = tek aktif kullanıcı; devir YALNIZ taze girişle (çalınmış/eski oturum ya da
      // başkasının jetonunu bilen biri kurbanın cihaz bildirimlerini kendine çekemesin).
      if (!isFreshAuth(session, Date.now())) {
        throw new ApiError('CONFLICT', 'Bu cihaz başka bir hesaba bağlı. Devralmak için yeniden giriş yapın.');
      }
    }
    // Sahiplik where'de sabitlenir: devir yalnız yukarıdaki kontrolden sonra (yarış → P2002/0 satır).
    const sub = existing
      ? await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: { userId: user.id, isActive: true, lastUsedAt: new Date(), userAgent },
          select: { id: true },
        })
      : await prisma.pushSubscription.create({
          data: { userId: user.id, endpoint, p256dh: NATIVE_KEY_PLACEHOLDER, auth: NATIVE_KEY_PLACEHOLDER, userAgent },
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
