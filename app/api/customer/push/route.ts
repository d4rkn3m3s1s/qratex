import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { isAllowedPushEndpoint, MAX_PUSH_ENDPOINT_LENGTH } from '@/lib/push-endpoint';

export const dynamic = 'force-dynamic';

const MAX_ENDPOINT_LEN = MAX_PUSH_ENDPOINT_LENGTH;
const MAX_KEY_LEN = 512;
/** Hesap başına etkin cihaz aboneliği tavanı (her bildirim hepsine gider → dış istek çoğaltma). */
const MAX_ACTIVE_SUBSCRIPTIONS = 10;

function isValidSubscription(sub: unknown): sub is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!sub || typeof sub !== 'object') return false;
  const s = sub as Record<string, unknown>;
  const endpoint = s.endpoint;
  const keys = s.keys;
  // Yalnız tarayıcı push servisleri (https + bilinen alan adı): keyfi adres = sunucudan SSRF.
  if (!isAllowedPushEndpoint(endpoint)) return false;
  if (!keys || typeof keys !== 'object') return false;
  const k = keys as Record<string, unknown>;
  const p256dh = k.p256dh;
  const auth = k.auth;
  if (typeof p256dh !== 'string' || p256dh.length === 0 || p256dh.length > MAX_KEY_LEN) return false;
  if (typeof auth !== 'string' || auth.length === 0 || auth.length > MAX_KEY_LEN) return false;
  return true;
}

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

    const body = await req.json().catch(() => ({}));
    const { subscription } = body as { subscription?: unknown };

    if (!isValidSubscription(subscription)) {
      return NextResponse.json(
        { error: 'Geçersiz bildirim aboneliği.', code: 'VALIDATION' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

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
          { error: 'Abonelik güncellenemedi' },
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
      { error: 'Internal Server Error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    const body = await req.json().catch(() => ({}));
    const { endpoint } = body as { endpoint?: unknown };

    if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LEN) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

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
      { error: 'Internal Server Error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
