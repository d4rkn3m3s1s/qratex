import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DB CLEANUP cron: DB'yi yalın tutar → indexler küçük, sorgular hızlı. YALNIZCA güvenli,
 * geri-dönüşü önemsiz veri silinir (süresi geçmiş/kullanılmış token, ölü rate-limit kovası,
 * eski OKUNMUŞ bildirim). Ekonomi/fraud verisi (points_credited, AnalyticsEvent) SİLİNMEZ.
 * cron-job.org'dan günde 1 kez (Bearer CRON_SECRET).
 */
function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret.trim()}`;
  const got = (authHeader ?? '').trim();
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result: Record<string, number> = {};

  // 1) Süresi geçmiş VEYA kullanılmış auth token'ları (şifre-reset / magic-login).
  result.authTokens = (await prisma.authEmailToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
  }).catch(() => ({ count: 0 }))).count;

  // 2) Ölü rate-limit kovaları (penceresi geçmiş — artık gereksiz).
  result.rateLimitBuckets = (await prisma.rateLimitCounter.deleteMany({
    where: { resetAt: { lt: now } },
  }).catch(() => ({ count: 0 }))).count;

  // 3) 30 günden eski OKUNMUŞ bildirimler (okunmamışlara dokunma).
  result.oldNotifications = (await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: thirtyDaysAgo } },
  }).catch(() => ({ count: 0 }))).count;

  return NextResponse.json({ ok: true, deleted: result });
}
