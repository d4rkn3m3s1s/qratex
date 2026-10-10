/**
 * Oturumsuz gönderilmiş QR geri bildirimini hesaba bağlama ve ödülünü verme (Bulgu 7).
 *
 * Tek seferlik garanti veritabanında:
 *  - `updateMany({ id, userId: null, deletedAt: null })` → yarışan iki talepten yalnız biri bağlar,
 *  - kredi `mintPoints` + `feedback:<id>` defter anahtarı (PointsLedger @unique) → ikinci kez basılmaz.
 * İkisi aynı transaction'da: kredi başarısızsa bağlama da geri alınır.
 * Ödül, gönderim anındaki "detaylı" kararıyla (imzalı belirteçte) ve talep anındaki
 * çarpan/tavanla hesaplanır. İşletmenin sahibi/personeli bağlayamaz.
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { mintPoints } from '@/lib/economy';
import { getPointsMatrix } from '@/lib/points-rules';
import { verifyClaimToken, CLAIM_TOKEN_TTL_MS } from './claim-token';
import { computeFeedbackGrant, levelProgress } from './reward';
import { isVenueInsider } from './venue';
import { scheduleClaimSideEffects } from './on-feedback-created';
import type { ClaimFeedbackResult } from './schema';

export async function claimFeedback(userId: string, token: string, now: Date = new Date()): Promise<ClaimFeedbackResult> {
  const verified = verifyClaimToken(token, now.getTime());
  if (!verified.ok) {
    throw new ApiError(
      'BAD_REQUEST',
      verified.reason === 'expired'
        ? 'Bu yorumu hesaba bağlama süresi (24 saat) doldu.'
        : 'Bağlama bağlantısı geçersiz.',
      { details: { reason: verified.reason } }
    );
  }
  const { f: feedbackId, d: detailed } = verified.claims;

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { id: true, userId: true, deletedAt: true, createdAt: true, rating: true, qrCode: { select: { id: true, dealerId: true } } },
  });
  if (!feedback || feedback.deletedAt || !feedback.qrCode) {
    throw new ApiError('NOT_FOUND', 'Bu yorum artık bulunmuyor.');
  }
  if (feedback.userId) {
    throw new ApiError(
      'CONFLICT',
      feedback.userId === userId ? 'Bu yorum zaten hesabına bağlı.' : 'Bu yorum başka bir hesaba bağlanmış.',
      { details: { reason: feedback.userId === userId ? 'already_yours' : 'taken' } }
    );
  }
  // Belirteç süresinden bağımsız ikinci emniyet: yalnız son 24 saatin yorumu.
  if (now.getTime() - feedback.createdAt.getTime() > CLAIM_TOKEN_TTL_MS) {
    throw new ApiError('BAD_REQUEST', 'Bu yorumu hesaba bağlama süresi (24 saat) doldu.', { details: { reason: 'expired' } });
  }
  const dealerId = feedback.qrCode.dealerId;
  if (await isVenueInsider(userId, dealerId)) {
    throw new ApiError('FORBIDDEN', 'Kendi işletmen için yazılan yorum puan kazandırmaz.', { details: { reason: 'insider' } });
  }

  const matrix = await getPointsMatrix();
  const result = await prisma.$transaction(
    async (tx) => {
      const linked = await tx.feedback.updateMany({
        where: { id: feedbackId, userId: null, deletedAt: null },
        data: { userId },
      });
      if (linked.count !== 1) {
        throw new ApiError('CONFLICT', 'Bu yorum başka bir hesaba bağlanmış.', { details: { reason: 'taken' } });
      }
      const grant = await computeFeedbackGrant(tx, userId, detailed, matrix, now);
      const minted = await mintPoints(tx, {
        userId,
        points: grant.points,
        xp: grant.xp,
        source: 'feedback',
        sourceId: feedbackId,
        idempotencyKey: `feedback:${feedbackId}`,
        meta: { ...grant.meta, dealerId, qrCodeId: feedback.qrCode!.id, claimed: true },
        now,
      });
      let squadContribution = 0;
      if (minted.status === 'posted' && minted.credited > 0) {
        const { addToSquadTreasury, addToActiveBattleScore } = await import('@/lib/gamification-engine');
        squadContribution = await addToSquadTreasury(userId, minted.credited, tx);
        await addToActiveBattleScore(userId, minted.credited, tx);
      }
      await tx.notification.create({
        data: {
          userId,
          title: 'Yorumun hesabına eklendi',
          message:
            minted.credited > 0
              ? `Hesabına bağladığın geri bildirim için ${minted.credited} puan kazandın.`
              : 'Yorumun hesabına eklendi. Bugünkü yorum puanı sınırına ulaştığın için puan eklenmedi.',
          type: 'success',
          data: { feedbackId, pointsEarned: minted.credited, xpEarned: minted.xpCredited, ctaPath: '/customer/me/voices' },
        },
      });
      return { grant, minted, squadContribution };
    },
    { maxWait: 5_000, timeout: 10_000 }
  );

  try {
    const { applyTrustEvaluation } = await import('@/lib/trust-score');
    await applyTrustEvaluation(feedbackId, { userId, dealerId, rating: feedback.rating });
  } catch (err) {
    console.error('[feedback-funnel] bağlama sonrası güven değerlendirmesi başarısız', err);
  }
  scheduleClaimSideEffects(userId);

  const { grant, minted } = result;
  return {
    feedbackId,
    reward: {
      status: minted.capped || minted.credited < grant.points ? 'capped' : 'credited',
      points: minted.credited,
      xp: minted.xpCredited,
      requested: grant.points,
      level: minted.level,
      leveledUp: minted.isLevelUp,
      ...levelProgress(minted.xp),
      squadContribution: result.squadContribution,
    },
  };
}
