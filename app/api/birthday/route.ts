import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { mintPoints } from '@/lib/economy';
import { getBirthdayBonusPoints, getPointsMatrix } from '@/lib/points-rules';
import {
  BIRTHDAY_CLAIM_MESSAGES,
  evaluateBirthdayClaim,
  istanbulDayStart,
  parseBirthDateInput,
} from '@/lib/birthday';

export const dynamic = 'force-dynamic';

/**
 * Doğum günü — kaydet (bir kez) / bonus talep et (yılda bir kez).
 * Tüketenler: Cüzdan → Kartım statü bölümü, Ayarlar → Profil, global doğum günü popup'ı,
 * bildirim merkezi. Yanıt alanları geriye uyumlu (`success`, `birthday`, `isBirthdayToday`,
 * `canClaimBonus`, `bonusAmount`, hata `error` metni) — zarf v2 `legacySpread` ile.
 *
 * Lounge raporu B3/B7 düzeltmeleri:
 *  - `requireAuth(['CUSTOMER'])` (defineRoute): rol + token-replay; çıplak `getServerSession` yok.
 *  - "Bugün" Europe/Istanbul'a göre; 29 Şubat artık olmayan yılda 28 Şubat (`lib/birthday.ts`).
 *  - Tarih en az 30 gün önce kaydedilmiş olmalı (bugüne ayarla → anında 500 puan kapandı);
 *    kural atomik guard'ın içinde de uygulanır.
 *  - Puan yalnız `mintPoints` ile (defter + tek-kez anahtarı `birthday:<kullanıcı>:<yıl>` +
 *    `points_credited` aynı tx'te).
 *  - Hatalar makine okunur `code` + Türkçe metin (`NOT_SET`, `NOT_TODAY`, `ALREADY_CLAIMED`,
 *    `TOO_RECENT`, `BIRTHDAY_LOCKED`, `INVALID_DATE`).
 */
export const GET = defineRoute(
  { name: 'birthday.get', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const now = new Date();
    const [matrix, birthday] = await Promise.all([
      getPointsMatrix(),
      prisma.userBirthday.findUnique({
        where: { userId: user.id },
        select: { birthDate: true, bonusGiven: true, lastBonusAt: true, createdAt: true },
      }),
    ]);
    const bonusAmount = getBirthdayBonusPoints(matrix);
    const decision = evaluateBirthdayClaim(birthday, now);

    // Bildirim merkezi hatırlatması: İstanbul günü başına en fazla bir kez.
    if (decision.canClaim) {
      const dayStart = istanbulDayStart(now);
      const existing = await prisma.notification.findFirst({
        where: { userId: user.id, type: 'BIRTHDAY_CLAIM', createdAt: { gte: dayStart } },
        select: { id: true },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'BIRTHDAY_CLAIM',
            title: '🎂 Doğum günün kutlu olsun!',
            message: `Bugün +${bonusAmount} bonus puanını talep edebilirsin. Cüzdan → Kartım'dan da alabilirsin.`,
            isRead: false,
            data: { cta: 'birthday_claim', bonusAmount } as object,
          },
        });
      }
    }

    return ok(
      {
        birthday,
        isBirthdayToday: decision.isToday,
        canClaimBonus: decision.canClaim,
        claimReason: decision.reason,
        locked: !!birthday,
        bonusAmount,
      },
      { legacySpread: true }
    );
  }
);

const PostBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), birthDate: z.string().min(8).max(32) }),
  z.object({ action: z.literal('claim') }),
]);

export const POST = defineRoute(
  { name: 'birthday.post', roles: ['CUSTOMER'], schema: PostBody, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ user, body }) => {
    const now = new Date();

    if (body.action === 'set') {
      const birthDate = parseBirthDateInput(body.birthDate, now);
      if (!birthDate) throw new ApiError('INVALID_DATE', 'Geçersiz doğum tarihi.', { status: 400 });
      // Suistimal önleme: doğum günü BİR KEZ ayarlanır, sonra DEĞİŞTİRİLEMEZ (destek süreci).
      const existing = await prisma.userBirthday.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (existing) {
        throw new ApiError(
          'BIRTHDAY_LOCKED',
          'Doğum günü zaten kayıtlı ve değiştirilemez. Hatalıysa destek ile iletişime geç.',
          { status: 409 }
        );
      }
      const birthday = await prisma.userBirthday.create({
        data: { userId: user.id, birthDate },
        select: { birthDate: true, bonusGiven: true, lastBonusAt: true, createdAt: true },
      });
      return ok({ message: 'Doğum günü kaydedildi. (Bir daha değiştirilemez.)', birthday }, { legacySpread: true });
    }

    // claim
    const [matrix, record] = await Promise.all([
      getPointsMatrix(),
      prisma.userBirthday.findUnique({
        where: { userId: user.id },
        select: { id: true, birthDate: true, createdAt: true, lastBonusAt: true },
      }),
    ]);
    const bonus = getBirthdayBonusPoints(matrix);
    const decision = evaluateBirthdayClaim(record, now);
    if (!decision.canClaim || !record) {
      const reason = decision.reason === 'OK' ? 'NOT_SET' : decision.reason;
      throw new ApiError(reason, BIRTHDAY_CLAIM_MESSAGES[reason], { status: reason === 'ALREADY_CLAIMED' ? 409 : 400 });
    }

    const minCreatedAt = new Date(now.getTime() - 30 * 86_400_000);
    const credited = await prisma.$transaction(async (tx) => {
      // Atomik guard: bu (İstanbul) yıl alınmamış VE 30 günden eski kayıt güncellenir.
      // İki eşzamanlı istekten yalnız biri count=1 alır.
      const guard = await tx.userBirthday.updateMany({
        where: {
          userId: user.id,
          createdAt: { lte: minCreatedAt },
          OR: [{ lastBonusAt: null }, { lastBonusAt: { lt: decision.yearStart } }],
        },
        data: { bonusGiven: true, lastBonusAt: now },
      });
      if (guard.count === 0) return null;

      await tx.notification.deleteMany({ where: { userId: user.id, type: 'BIRTHDAY_CLAIM' } });
      const mint = await mintPoints(tx, {
        userId: user.id,
        points: bonus,
        source: 'birthday',
        sourceId: record.id,
        idempotencyKey: `birthday:${user.id}:${decision.year}`,
        now,
      });
      // Defterde bu yılın anahtarı zaten varsa (ör. kayıt elle sıfırlandı) ikinci kredi yok.
      if (mint.duplicate) return null;
      await tx.notification.create({
        data: {
          userId: user.id,
          type: 'BIRTHDAY_BONUS',
          title: '🎂 Doğum günün kutlu olsun!',
          message: `${mint.credited} bonus puan hesabına eklendi!`,
        },
      });
      return mint;
    });

    if (!credited) {
      throw new ApiError('ALREADY_CLAIMED', BIRTHDAY_CLAIM_MESSAGES.ALREADY_CLAIMED, { status: 409 });
    }

    return ok(
      {
        message: `🎂 Doğum günün kutlu olsun! ${credited.credited} puan kazandın!`,
        pointsEarned: credited.credited,
        points: credited.points,
      },
      { legacySpread: true }
    );
  }
);
