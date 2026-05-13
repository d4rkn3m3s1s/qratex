import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { feedbackSchema, listQueryPageSchema } from '@/lib/validations';
import { PRIVATE_NO_STORE_HEADERS, paginationSkip, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { analyzeWithFallback } from '@/lib/ai-engine';
import {
  formatAdaptiveProfile,
  getAdaptiveProfileForDealer,
  maybeTriggerAdaptiveUpdate,
  storeFeedbackEmbedding,
} from '@/lib/ai-learning';
import { getFeedbackReward, getPointsMatrix } from '@/lib/points-rules';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { capFeedbackPoints } from '@/lib/points-caps';
import { checkRateLimit, checkFeedbackPerQrRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { inngestQueueEnabled, sendFeedbackAnalyze } from '@/lib/inngest/send';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { processAutoReplies } from '@/lib/auto-reply-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const parsed = listQueryPageSchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });
    const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 50 };
    const qrCodeId = searchParams.get('qrCodeId');
    const sentiment = searchParams.get('sentiment');
    const needsReview = searchParams.get('needsReview') === 'true'; // P2-27: intentScore < 0.7 manuel inceleme
    const skip = paginationSkip(page, pageSize);

    let where: Record<string, unknown> = { deletedAt: null };
    if (needsReview) (where as any).intentScore = { lt: 0.7 };

    if (session.user.role === 'CUSTOMER') {
      where.userId = session.user.id;
    } else if (session.user.role === 'DEALER') {
      where.qrCode = { dealerId: session.user.id };
    }
    // ADMIN sees all - no where filter

    if (qrCodeId) {
      where.qrCodeId = qrCodeId;
    }

    // Sentiment filter
    if (sentiment && sentiment !== 'all') {
      where.sentiment = sentiment;
    }

    const feedbackListSelect = {
      id: true,
      qrCodeId: true,
      userId: true,
      rating: true,
      text: true,
      media: true,
      npsScore: true,
      sentiment: true,
      emotions: true,
      topics: true,
      isPublic: true,
      dealerReply: true,
      dealerRepliedAt: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
      qrCode: {
        select: {
          id: true,
          name: true,
          code: true,
          dealer: { select: { businessName: true } },
        },
      },
    } as const;

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: feedbackListSelect,
      }),
      prisma.feedback.count({ where }),
    ]);

    // Format response to include businessName and properly format JSON fields
    const formattedFeedbacks = feedbacks.map((f) => {
      let topics: string[] = [];
      if (f.topics) {
        if (Array.isArray(f.topics)) {
          topics = f.topics as string[];
        } else if (typeof f.topics === 'object') {
          topics = Object.keys(f.topics as object);
        }
      }

      let emotions: string[] = [];
      if (f.emotions && typeof f.emotions === 'object' && !Array.isArray(f.emotions)) {
        emotions = Object.keys(f.emotions as Record<string, unknown>);
      } else if (Array.isArray(f.emotions)) {
        emotions = (f.emotions as unknown[]).filter((e): e is string => typeof e === 'string');
      }

      return {
        id: f.id,
        qrCodeId: f.qrCodeId,
        userId: f.userId,
        rating: f.rating,
        text: f.text,
        media: f.media,
        npsScore: f.npsScore,
        sentiment: f.sentiment,
        topics,
        emotions,
        isPublic: f.isPublic,
        dealerReply: f.dealerReply,
        dealerRepliedAt: f.dealerRepliedAt,
        createdAt: f.createdAt,
        user: f.user,
        qrCode: {
          id: f.qrCode.id,
          name: f.qrCode.name,
          code: f.qrCode.code,
          businessName: f.qrCode.dealer?.businessName || f.qrCode.name,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: formattedFeedbacks,
        items: formattedFeedbacks,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'GET /api/feedbacks', status: 500 });
    console.error('Error fetching feedbacks:', error);
    return NextResponse.json(
      { error: 'Geri bildirimler getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientId = getClientIdentifier(request);
  const limit = checkRateLimit('feedback', clientId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Çok fazla geri bildirim gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          ...(limit.retryAfterMs ? { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } : {}),
        },
      }
    );
  }

  try {
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const validatedData = feedbackSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { qrCodeId, rating, text, media, isPublic, npsScore, utmSource, utmCampaign, utmMedium, attributionSource, dealerStaffId } = validatedData.data;

    // Check if QR code exists and is active
    const qrCode = await prisma.qRCode.findUnique({
      where: { id: qrCodeId },
    });

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR kod bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const now = new Date();
    const expired = qrCode.expiresAt ? now > qrCode.expiresAt : false;
    const revoked = !!qrCode.revokedAt;
    if (!qrCode.isActive || expired || revoked) {
      return NextResponse.json(
        { error: 'QR kod aktif değil, süresi dolmuş veya iptal edilmiş' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const qrLimit = checkFeedbackPerQrRateLimit(qrCodeId, clientId);
    if (!qrLimit.ok) {
      return NextResponse.json(
        { error: 'Bu QR kod için çok fazla gönderim. Lütfen kısa süre sonra tekrar deneyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(qrLimit.retryAfterMs
              ? { 'Retry-After': String(Math.ceil(qrLimit.retryAfterMs / 1000)) }
              : {}),
          },
        }
      );
    }

    const idemCheck = await checkIdempotency(request, 'feedback');
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        qrCodeId,
        userId: session?.user?.id || null,
        rating,
        text,
        media: media ?? [],
        isPublic: isPublic ?? true,
        ...(npsScore != null && npsScore >= 0 && npsScore <= 10 && { npsScore }),
        ...(utmSource && { utmSource }),
        ...(utmCampaign && { utmCampaign }),
        ...(utmMedium && { utmMedium }),
        ...(attributionSource && { attributionSource }),
        ...(dealerStaffId && { dealerStaffId }),
      },
    });

    // Update QR code scan count
    await prisma.qRCode.update({
      where: { id: qrCodeId },
      data: { scanCount: { increment: 1 } },
    });

    // Award points to user if logged in (anti-exploit: günlük/haftalık tavan)
    if (session?.user?.id) {
      const matrix = await getPointsMatrix();
      const reward = getFeedbackReward(text, matrix);
      const cappedPoints = await capFeedbackPoints(session.user.id, reward.points);

      if (cappedPoints > 0 || reward.xp > 0) {
        await creditPointsAndXp(prisma, {
          userId: session.user.id,
          points: cappedPoints,
          xp: reward.xp,
        });
        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'points_credited',
            category: 'feedback',
            data: { points: cappedPoints, xp: reward.xp },
          },
        });
      }

      if (cappedPoints > 0) {
        await prisma.notification.create({
          data: {
            userId: session.user.id,
            title: 'Puan Kazandınız! 🎉',
            message: `Geri bildiriminiz için ${cappedPoints} puan kazandınız.`,
            type: 'success',
          },
        });
      }
    }

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: session?.user?.id || null,
        event: 'feedback_submitted',
        category: 'feedback',
        data: { feedbackId: feedback.id, rating, hasText: !!text },
      },
    });

    // ── Otomatik AI Analizi (arka planda) ──
    // Metin varsa ve yeterli uzunluktaysa AI analiz çalıştır
    if (text && text.trim().length >= 5) {
      // Dealer'ın AI ayarlarını kontrol et
      const dealerId = qrCode.dealerId;
      let shouldAnalyze = true;

      let aiSettings: { isEnabled: boolean; autoAnalyze: boolean; customPrompt: string | null } | null = null;
      try {
        aiSettings = await prisma.aISettings.findUnique({
          where: { dealerId },
          select: { isEnabled: true, autoAnalyze: true, customPrompt: true },
        });

        // AI kapalıysa veya otomatik analiz devre dışıysa atla
        if (aiSettings && (!aiSettings.isEnabled || !aiSettings.autoAnalyze)) {
          shouldAnalyze = false;
        }
      } catch {
        // Ayarlar bulunamazsa varsayılan olarak analiz yap
      }

      if (shouldAnalyze) {
        // P2-20: Queue mode - Inngest ile arka planda analiz; yoksa inline
        if (inngestQueueEnabled()) {
          sendFeedbackAnalyze(feedback.id, dealerId).catch((err) =>
            console.error('[Inngest] Failed to enqueue feedback/analyze:', err)
          );
        } else {
          // Inline arka plan (önceki davranış)
          let adaptiveProfileText: string | undefined;
          try {
            const adaptiveProfile = await getAdaptiveProfileForDealer(dealerId);
            adaptiveProfileText = adaptiveProfile?.profile ? formatAdaptiveProfile(adaptiveProfile.profile) : undefined;
          } catch {
            adaptiveProfileText = undefined;
          }

          analyzeWithFallback(text, { customPrompt: aiSettings?.customPrompt || undefined, adaptiveProfile: adaptiveProfileText, dealerId }).then(async (analysis) => {
            try {
              await prisma.feedback.update({
                where: { id: feedback.id },
                data: {
                  sentiment: analysis.sentiment.label,
                  emotions: analysis.emotions.map(e => e.label),
                  topics: analysis.topics,
                  isToxic: analysis.toxicity.isToxic,
                  aiAnalysis: JSON.parse(JSON.stringify(analysis)),
                  // Experience Signals
                  intent: analysis.intent?.label || null,
                  intentScore: analysis.intent?.score || null,
                  urgency: analysis.urgency || null,
                  effortScore: analysis.effortScore || null,
                  churnRisk: analysis.churnRisk || null,
                  // Advanced NLP
                  entities: analysis.entities ? JSON.parse(JSON.stringify(analysis.entities)) : null,
                  themes: analysis.themes ? JSON.parse(JSON.stringify(analysis.themes)) : null,
                  statementSentiments: analysis.statementSentiments ? JSON.parse(JSON.stringify(analysis.statementSentiments)) : null,
                  actionSuggestions: analysis.actionSuggestions ? JSON.parse(JSON.stringify(analysis.actionSuggestions)) : null,
                  // Meta
                  aiProcessedAt: new Date(),
                  aiModelUsed: analysis.modelUsed || null,
                  aiVersion: analysis.version || null,
                },
              });

              // Toksik içerik uyarısı
              if (analysis.toxicity.isToxic) {
                await prisma.notification.create({
                  data: {
                    userId: dealerId,
                    title: '⚠️ Toksik İçerik Tespit Edildi',
                    message: `Bir geri bildirimde uygunsuz içerik tespit edildi. Lütfen inceleyin.`,
                    type: 'warning',
                  },
                });
              }

              // Yüksek aciliyet uyarısı
              if (analysis.urgency && analysis.urgency > 0.7) {
                await prisma.notification.create({
                  data: {
                    userId: dealerId,
                    title: '🔴 Acil Geri Bildirim',
                    message: `Yüksek aciliyetli bir geri bildirim alındı. Hemen aksiyon gerekebilir.`,
                    type: 'warning',
                  },
                });
              }

              // Yüksek churn riski uyarısı
              if (analysis.churnRisk && analysis.churnRisk > 0.7) {
                await prisma.notification.create({
                  data: {
                    userId: dealerId,
                    title: '⚡ Müşteri Kaybı Riski',
                    message: `Bir müşterinin kaybedilme riski yüksek. Geri bildirimi inceleyin.`,
                    type: 'warning',
                  },
                });
              }

              await storeFeedbackEmbedding({ feedbackId: feedback.id, dealerId, text });
              await maybeTriggerAdaptiveUpdate(dealerId);

              // AI analizinden sonra otomatik yanıt kurallarını işlet
              await processAutoReplies(feedback.id);

              if (process.env.NODE_ENV === 'development') {
                console.log(`[AI] Feedback ${feedback.id} analyzed: ${analysis.sentiment.label}, model: ${analysis.modelUsed}`);
              }
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.error(`[AI] Failed to save analysis for feedback ${feedback.id}:`, err);
              } else {
                console.error('[AI] Failed to save analysis for feedback:', err);
              }
            }
          }).catch(err => {
            if (process.env.NODE_ENV === 'development') {
              console.error(`[AI] Analysis failed for feedback ${feedback.id}:`, err);
            } else {
              console.error('[AI] Analysis failed for feedback:', err);
            }
          });
        }
      } else {
        // Eğer AI analizi kapalıysa kuralları hemen işle
        processAutoReplies(feedback.id).catch(console.error);
      }
    } else {
      // Metin yoksa veya kısa ise AI analizi yapılmaz, kuralları hemen işle
      processAutoReplies(feedback.id).catch(console.error);
    }

    const resBody = { success: true, feedback };
    if (idemKey) await storeIdempotency(idemKey, 'feedback', 200, resBody);
    return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/feedbacks', status: 500 });
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: 'Geri bildirim gönderilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

