import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const MAX_ENDPOINT_LEN = 2048;
const MAX_KEY_LEN = 512;

function isValidSubscription(sub: unknown): sub is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!sub || typeof sub !== 'object') return false;
  const s = sub as Record<string, unknown>;
  const endpoint = s.endpoint;
  const keys = s.keys;
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LEN) {
    return false;
  }
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { subscription } = body as { subscription?: unknown };

    if (!isValidSubscription(subscription)) {
      return NextResponse.json(
        { error: 'Invalid subscription' },
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

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
