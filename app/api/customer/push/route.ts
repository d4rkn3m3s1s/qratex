import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import prisma from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { isAllowedPushEndpoint, MAX_PUSH_ENDPOINT_LENGTH } from '@/lib/push-endpoint';

export const dynamic = 'force-dynamic';

const MAX_ENDPOINT_LEN = MAX_PUSH_ENDPOINT_LENGTH;
const MAX_KEY_LEN = 512;
/** Hesap başına etkin cihaz aboneliği tavanı (her bildirim hepsine gider → dış istek çoğaltma). */
const MAX_ACTIVE_SUBSCRIPTIONS = 10;

/** Abonelik gövdesi (zod): yalnız tarayıcı push servisleri (https + bilinen alan adı) — keyfi adres = sunucudan SSRF. */
const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().max(MAX_ENDPOINT_LEN).refine((e) => isAllowedPushEndpoint(e)),
    keys: z.object({
      p256dh: z.string().min(1).max(MAX_KEY_LEN),
      auth: z.string().min(1).max(MAX_KEY_LEN),
    }),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(MAX_ENDPOINT_LEN) });

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    const rl = await checkRateLimitDb(`customer_push:${session.user.id}`, 20, 60 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla bildirim kaydı denemesi. Lütfen daha sonra tekrar deneyin.', code: 'RATE_LIMITED' },
        { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? 60_000) / 1000))) } }
      );
    }

    const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz bildirim aboneliği.', code: 'VALIDATION' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { subscription } = parsed.data;

    const userId = session.user.id;
    const userAgent = req.headers.get('user-agent') || undefined;

    const existingSub = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });

    if (existingSub) {
      if (existingSub.userId !== userId) {
        return NextResponse.json(
          {
            error:
              'Bu cihaz bildirim kaydı başka bir hesaba bağlı. Aynı tarayıcıda farklı hesapla kayıt için önce diğer hesaptan çıkın.',
          },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      const n = await prisma.pushSubscription.updateMany({
        where: { id: existingSub.id, userId },
        data: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
      if (n.count === 0) {
        return NextResponse.json(
          { error: 'Abonelik güncellenemedi.' },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
    } else {
      const active = await prisma.pushSubscription.count({ where: { userId, isActive: true } });
      if (active >= MAX_ACTIVE_SUBSCRIPTIONS) {
        return NextResponse.json(
          {
            error: `En fazla ${MAX_ACTIVE_SUBSCRIPTIONS} cihazda bildirim açık olabilir. Ayarlar → Cihazlar bölümünden eski bir cihazı kaldırın.`,
            code: 'LIMIT_REACHED',
          },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
        },
      });
    }

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Save Push Error:', error);
    return NextResponse.json(
      { error: 'Bildirim ayarı şu an kaydedilemedi. Lütfen tekrar deneyin.' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const session = auth.session;
    const limited = await enforceRouteRateLimit('customer.push.unsubscribe', session.user.id, 'mutation');
    if (limited) return limited;

    const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Bildirim aboneliği adresi eksik ya da geçersiz.', code: 'VALIDATION' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { endpoint } = parsed.data;

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: session.user.id,
        endpoint,
      },
    });

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Delete Push Error:', error);
    return NextResponse.json(
      { error: 'Bildirim aboneliği şu an kaldırılamadı. Lütfen tekrar deneyin.' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
