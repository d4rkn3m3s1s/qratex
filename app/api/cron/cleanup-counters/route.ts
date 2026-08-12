import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret.trim()}`;
  const got = (authHeader ?? '').trim();
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/**
 * Vercel Cron — TTL'siz büyüyen sayaç/kayıt tablolarını temizler (DB şişmesini önler).
 * RateLimitCounter (süresi geçmiş + kilitli değil), SessionTokenUsage (30 günden eski jti),
 * IdempotencyKey (süresi geçmiş), InternEmailSend (test kayıtları 90 günden eski).
 * Her tablonun temizlik index'i var (resetAt/lastSeen/expiresAt). CRON_SECRET fail-closed.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Süresi geçmiş rate-limit sayaçları (kilitli olmayanlar — aktif blok kalsın).
  const rateLimit = await prisma.rateLimitCounter
    .deleteMany({ where: { resetAt: { lt: now }, lockedUntil: null } })
    .then((r) => r.count).catch(() => -1);

  // 30 günden eski JWT jti kullanım kayıtları (token zaten expire olmuştur).
  const sessionTokens = await prisma.sessionTokenUsage
    .deleteMany({ where: { lastSeen: { lt: days30 } } })
    .then((r) => r.count).catch(() => -1);

  // Süresi geçmiş idempotency anahtarları.
  const idempotency = await prisma.idempotencyKey
    .deleteMany({ where: { expiresAt: { lt: now } } })
    .then((r) => r.count).catch(() => -1);

  // 90 günden eski TEST mail kayıtları (gerçek 'send' kayıtları kalır — istatistik).
  const internTestMails = await prisma.internEmailSend
    .deleteMany({ where: { kind: 'test', createdAt: { lt: days90 } } })
    .then((r) => r.count).catch(() => -1);

  return NextResponse.json({
    ok: true,
    deleted: { rateLimit, sessionTokens, idempotency, internTestMails },
  });
}
