/**
 * QR geri bildirimi gönderim çekirdeği — `POST /api/public/feedback/[code]` (yeni huni) ve
 * geriye uyumlu `POST /api/feedbacks` aynı fonksiyonu kullanır (iki ayrı hat kalmaz).
 *
 * Sıra:
 *  1. QR (kod ya da id) + durum (arşiv/pasif/süre/iptal) — mesajlı 404.
 *  2. QR × IP hız sınırı (5/dk).
 *  3. Girdi temizliği: personel bu işletmenin AKTİF personeli değilse yok sayılır; medya
 *     yalnız kendi R2 alanımızdaki bu QR'a ait URL'ler; etiketler sabit kimlikler.
 *  4. Çıkar çatışması: görüntüleyen işletmenin sahibi/personeli ise kayıt `trustFlagged` +
 *     ödülsüz (rapor Bulgu 5).
 *  5. Üye: kayıt + ödül TEK transaction'da; ödül `mintPoints` (defter anahtarı
 *     `feedback:<id>`, `feedback` tavanı, `points_credited`) — lib/economy kuralı.
 *     Anonim: kayıt + 24 saatlik bağlama belirteci (sonradan hesaba bağlama, Bulgu 7).
 *  6. Güven değerlendirmesi (üye), oturumdan bağımsız yan etkiler (Bulgu 1).
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { mintPoints } from '@/lib/economy';
import { getPointsMatrix } from '@/lib/points-rules';
import { checkFeedbackPerQrRateLimit } from '@/lib/rate-limit';
import { qrCodeCandidates } from '@/lib/qr-resolve';
import { composeStoredText, normalizeQuickTags } from './quick-tags';
import { acceptedMediaUrls } from './media';
import { qrStatusOf, isVenueInsider } from './venue';
import { computeFeedbackGrant, isDetailedText, levelProgress } from './reward';
import { signClaimToken } from './claim-token';
import { scheduleFeedbackSideEffects } from './on-feedback-created';
import type { FeedbackRewardResult, SubmitFeedbackBody, SubmitFeedbackResult } from './schema';
import type { FunnelViewer } from './viewer';

export const INSIDER_TRUST_REASON = 'İşletme içi gönderim (çıkar çatışması)';

const STATUS_MESSAGES = {
  not_found: 'Bu QR kod bulunamadı.',
  archived: 'Bu QR kod artık kullanılmıyor.',
  inactive: 'Bu QR kod şu anda aktif değil.',
  expired: 'Bu QR kodun süresi dolmuş.',
  revoked: 'Bu QR kod iptal edilmiş.',
} as const;

export type QrRef = { code: string } | { id: string };

type QrRow = {
  id: string;
  code: string;
  dealerId: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
};

const QR_SELECT = {
  id: true,
  code: true,
  dealerId: true,
  isActive: true,
  expiresAt: true,
  revokedAt: true,
  archivedAt: true,
} as const;

async function findQr(ref: QrRef): Promise<QrRow | null> {
  if ('id' in ref) {
    return (await prisma.qRCode.findUnique({ where: { id: ref.id }, select: QR_SELECT })) as QrRow | null;
  }
  for (const code of qrCodeCandidates(ref.code)) {
    const row = (await prisma.qRCode.findUnique({ where: { code }, select: QR_SELECT })) as QrRow | null;
    if (row) return row;
  }
  return null;
}

/** QR'ı bulur ve gönderime açık olduğunu doğrular; değilse mesajlı `ApiError`. */
export async function requireOpenQr(ref: QrRef, now: Date = new Date()): Promise<QrRow> {
  const qr = await findQr(ref);
  if (!qr) throw new ApiError('NOT_FOUND', STATUS_MESSAGES.not_found, { details: { reason: 'not_found' } });
  const status = qrStatusOf(qr, now);
  if (status !== 'ok') throw new ApiError('NOT_FOUND', STATUS_MESSAGES[status], { details: { reason: status } });
  return qr;
}

export type SubmitContext = {
  viewer: FunnelViewer | null;
  /** Hız sınırı kimliği (IP). */
  clientId: string;
  now?: Date;
};

export async function submitFeedback(ref: QrRef, body: SubmitFeedbackBody, ctx: SubmitContext): Promise<SubmitFeedbackResult> {
  const now = ctx.now ?? new Date();
  const qr = await requireOpenQr(ref, now);
  const viewer = ctx.viewer;

  // Birbirinden bağımsız okumalar TEK turda (perf O4): QR başı hız sınırı, personel doğrulaması,
  // çıkar çatışması ve puan matrisi eskiden 4 sıralı DB/Redis turuydu (gönder anı gecikmesi).
  const [qrLimit, staffRow, insider, matrix] = await Promise.all([
    checkFeedbackPerQrRateLimit(qr.id, ctx.clientId),
    // Personel: yalnız bu işletmenin AKTİF personeli; değilse sessizce yok sayılır (kullanıcı cezalandırılmaz).
    body.staffId
      ? prisma.dealerStaff.findFirst({
          where: { id: body.staffId, dealerId: qr.dealerId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    viewer ? isVenueInsider(viewer.userId, qr.dealerId) : Promise.resolve(false),
    getPointsMatrix(),
  ]);
  if (!qrLimit.ok) {
    const retryAfter = Math.max(1, Math.ceil((qrLimit.retryAfterMs ?? 60_000) / 1000));
    throw new ApiError('RATE_LIMITED', 'Bu QR kod için çok fazla gönderim yapıldı. Lütfen kısa süre sonra tekrar deneyin.', {
      retryable: true,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  const staffId: string | null = staffRow?.id ?? null;

  const ownText = typeof body.text === 'string' ? body.text.trim() : '';
  const tags = normalizeQuickTags(body.tags);
  const storedText = composeStoredText(ownText, tags);
  const media = acceptedMediaUrls(body.media, qr.id);
  const npsScore = typeof body.npsScore === 'number' ? body.npsScore : null;
  const attribution = body.attribution ?? {};

  const detailed = isDetailedText(ownText, matrix);

  const data = {
    qrCodeId: qr.id,
    userId: viewer?.userId ?? null,
    rating: body.rating,
    text: storedText,
    media,
    isPublic: true,
    ...(npsScore != null ? { npsScore } : {}),
    ...(staffId ? { dealerStaffId: staffId } : {}),
    ...(attribution.utmSource ? { utmSource: attribution.utmSource } : {}),
    ...(attribution.utmCampaign ? { utmCampaign: attribution.utmCampaign } : {}),
    ...(attribution.utmMedium ? { utmMedium: attribution.utmMedium } : {}),
    ...(attribution.source ? { attributionSource: attribution.source } : {}),
    ...(insider ? { trustFlagged: true, trustReason: INSIDER_TRUST_REASON } : {}),
  };

  let feedback: { id: string; createdAt: Date };
  let reward: FeedbackRewardResult;

  if (viewer && !insider) {
    const userId = viewer.userId;
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.feedback.create({ data, select: { id: true, createdAt: true } });
      const grant = await computeFeedbackGrant(tx, userId, detailed, matrix, now);
      const minted = await mintPoints(tx, {
        userId,
        points: grant.points,
        xp: grant.xp,
        source: 'feedback',
        sourceId: created.id,
        idempotencyKey: `feedback:${created.id}`,
        meta: { ...grant.meta, dealerId: qr.dealerId, qrCodeId: qr.id },
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
          title: minted.isLevelUp ? `Seviye atladın! Seviye ${minted.level}` : 'Geri bildirimin için teşekkürler!',
          message:
            minted.credited > 0
              ? `Geri bildirimin için ${minted.credited} puan kazandın.`
              : 'Yorumun işletmeye ulaştı. Yorum puanı sınırına (günlük ya da haftalık) ulaştığın için puan eklenmedi.',
          type: 'success',
          data: { feedbackId: created.id, pointsEarned: minted.credited, xpEarned: minted.xpCredited, ctaPath: '/customer/me/voices' },
        },
      });
      return { created, minted, grant, squadContribution };
    }, { maxWait: 5_000, timeout: 10_000 });
    feedback = result.created;
    const { minted, grant } = result;
    reward = {
      status: minted.capped || minted.credited < grant.points ? 'capped' : 'credited',
      points: minted.credited,
      xp: minted.xpCredited,
      requested: grant.points,
      level: minted.level,
      leveledUp: minted.isLevelUp,
      ...levelProgress(minted.xp),
      squadContribution: result.squadContribution,
    };

    // Güven sinyalleri (yalnız işaretler; hata akışı bozmaz).
    try {
      const { applyTrustEvaluation } = await import('@/lib/trust-score');
      await applyTrustEvaluation(feedback.id, { userId, dealerId: qr.dealerId, rating: body.rating });
    } catch (err) {
      console.error('[feedback-funnel] güven değerlendirmesi başarısız', err);
    }
  } else {
    feedback = await prisma.feedback.create({ data, select: { id: true, createdAt: true } });
    if (viewer && insider) {
      reward = { status: 'conflict' };
    } else {
      try {
        const { token, expiresAt } = signClaimToken(feedback.id, detailed, now.getTime());
        const grant = detailed ? matrix.feedback.detailed : matrix.feedback.base;
        reward = { status: 'claimable', points: grant.points, xp: grant.xp, claimToken: token, expiresAt: expiresAt.toISOString() };
      } catch (err) {
        console.error('[feedback-funnel] bağlama belirteci üretilemedi', err);
        reward = { status: 'guest' };
      }
    }
  }

  scheduleFeedbackSideEffects({
    feedbackId: feedback.id,
    dealerId: qr.dealerId,
    qrCodeId: qr.id,
    rating: body.rating,
    text: storedText,
    hasOwnText: ownText.length > 0,
    tags,
    hasMedia: media.length > 0,
    npsScore,
    staffSelected: !!staffId,
    userId: viewer?.userId ?? null,
    insider,
    attributionSource: attribution.source ?? null,
    createdAt: feedback.createdAt,
  });

  return { feedbackId: feedback.id, createdAt: feedback.createdAt.toISOString(), reward };
}
