import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { cleanupMoments } from '@/lib/moments/server';
import { applyPersonalDataRetention } from '@/lib/gdpr-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DB CLEANUP cron: DB'yi yalın tutar → indexler küçük, sorgular hızlı. YALNIZCA güvenli,
 * geri-dönüşü önemsiz veri silinir (süresi geçmiş/kullanılmış token, ölü rate-limit kovası,
 * eski OKUNMUŞ bildirim, süresi dolmuş An Motoru kayıtları). Ekonomi/fraud verisi
 * (points_credited, AnalyticsEvent, PointsLedger) SİLİNMEZ.
 *
 * Ayrı dış tetikleyici YOK: günlük orkestratör (`/api/cron/daily`) bu `GET`'i yetkili sentetik
 * istekle çağırır (tek uyanış kuralı — Neon compute kotası). Elle: Bearer CRON_SECRET.
 */
async function step(name: string, fn: () => Promise<number>, errors?: string[]): Promise<number> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[CRON db-cleanup] ${name} başarısız:`, e);
    // `errors` verilen adımın hatası koşuyu başarısız sayar (orkestratör non-2xx + alarm).
    // An Motoru adımına verilmez: tablo canlıda henüz yokken her gün alarm üretmesin.
    errors?.push(`${name}: ${e instanceof Error ? e.message.slice(0, 200) : 'hata'}`);
    return 0;
  }
}

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result: Record<string, number> = {};
  const errors: string[] = [];

  // 1) Süresi geçmiş VEYA kullanılmış auth token'ları (şifre-reset / magic-login).
  result.authTokens = await step(
    'authTokens',
    async () =>
      (await prisma.authEmailToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
      })).count,
    errors
  );

  // 1b) Süresi geçmiş ESKİ doğrulama token'ları (NextAuth VerificationToken; ham saklanır).
  //     Yeni token üretilmiyor (AuthEmailToken hash'li); kalan eski satırlar yalnız tüketimde
  //     siliniyordu, tıklanmayanlar sonsuza kadar kalıyordu (veri modeli B7/B14).
  result.legacyVerificationTokens = await step(
    'legacyVerificationTokens',
    async () => (await prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } })).count,
    errors
  );

  // 2) Ölü rate-limit kovaları (penceresi geçmiş). AKTİF login kilidi olan kova SİLİNMEZ
  //    (denetim D2: eski `resetAt < now` koşulu süren kilitleri de kaldırıyordu; kural
  //    `cleanup-counters` ile aynı).
  result.rateLimitBuckets = await step(
    'rateLimitBuckets',
    async () =>
      (await prisma.rateLimitCounter.deleteMany({
        where: { resetAt: { lt: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      })).count,
    errors
  );

  // 3) 30 günden eski OKUNMUŞ bildirimler (okunmamışlara dokunma).
  result.oldNotifications = await step(
    'oldNotifications',
    async () =>
      (await prisma.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: thirtyDaysAgo } },
      })).count,
    errors
  );

  // 4) An Motoru (CustomerMoment): görülmüş anlar 30 gün, görülmemişler 90 gün sonra silinir.
  let momentsUnseen = 0;
  result.momentsSeen = await step('moments', async () => {
    const r = await cleanupMoments(prisma, now);
    momentsUnseen = r.unseen;
    return r.seen;
  });
  result.momentsUnseen = momentsUnseen;

  // 5) KVKK saklama süreleri (P0-34): PII_REGISTRY'de `retentionField` tanımlı kişisel kayıtlar
  //    (QRA sohbetleri 180 gün, anlık bildirim kayıtları 180 gün, bildirimler 365 gün).
  //    Süre politikada yazılı kalmasın, gerçekten uygulansın. Model hatası koşuyu başarısız sayar.
  await step('personalDataRetention', async () => {
    const retention = await applyPersonalDataRetention({ now });
    for (const [key, n] of Object.entries(retention.counts)) result[`retention:${key}`] = n;
    if (retention.errors.length) throw new Error(retention.errors.join('; '));
    return 0;
  }, errors);

  if (errors.length) {
    return NextResponse.json({ ok: false, error: errors.join('; '), deleted: result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: result });
}
