import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAiScope, scopeErrorResponse } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';
import { feedbackSchema, listQueryPageSchema } from '@/lib/validations';
import { PRIVATE_NO_STORE_HEADERS, paginationSkip, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // P0-05: rol listesi AÇIK. Eski kod rol listesiz `requireAuth()` + "CUSTOMER ve DEALER'ı
    // daralt, gerisi her şeyi görsün" idi → STAFF bütün kiracıların yorumlarını, müşteri adlarını
    // ve e-postalarını okuyordu.
    const auth = await requireAuth(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN']);
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

    const where: Record<string, unknown> = { deletedAt: null };
    if (needsReview) where.intentScore = { lt: 0.7 };

    // VARSAYILAN REDDET kapsamı: CUSTOMER → yalnız kendi yorumları; DEALER → kendi bayisi;
    // STAFF → DB'deki AKTİF bağlı bayi (pasif personel 403); ADMIN → `?dealerId=` ile tek bayi,
    // verilmezse platform geneli. Başka her rol `requireAuth` listesinde zaten reddedilir.
    const isAdmin = session.user.role === 'ADMIN';
    if (session.user.role === 'CUSTOMER') {
      where.userId = session.user.id;
    } else {
      const scope = await resolveAiScope(session, {
        dealerId: searchParams.get('dealerId'),
        allowPlatform: true,
      });
      if (!scope.ok) return scopeErrorResponse(scope);
      if (scope.dealerId) where.qrCode = { dealerId: scope.dealerId };
    }

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
      // E-posta yalnız ADMIN'e (KVKK veri minimizasyonu); bayi/personel/müşteri listesi e-posta taşımaz.
      user: {
        select: { id: true, name: true, email: isAdmin, image: true },
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

/**
 * POST /api/feedbacks — GERİYE UYUMLU giriş (sözleşme testi + sentetik izleme). Yeni huni
 * `POST /api/public/feedback/[code]` kullanır; ikisi de AYNI çekirdeği çağırır
 * (`lib/feedback-funnel/submit.ts`): oturumdan bağımsız yan etkiler, personel kiracı
 * doğrulaması, çıkar çatışması, `mintPoints` ile tek seferlik kredi. Eski gövde biçimi
 * (`qrCodeId`, `dealerStaffId`, düz UTM alanları) burada yeni gövdeye çevrilir; base64
 * `data:` medya artık kabul edilmez (yalnız kendi R2 URL'lerimiz).
 */
export async function POST(request: NextRequest) {
  const clientId = getClientIdentifier(request);
  const limit = await checkRateLimitDb(`feedback:${clientId}`, 20, 60_000);
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Gönderilen veri geçerli JSON değil.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const validatedData = feedbackSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const v = validatedData.data;

    const { submitFeedback } = await import('@/lib/feedback-funnel/submit');
    const { resolveOptionalViewer } = await import('@/lib/feedback-funnel/viewer');
    const { ATTRIBUTION_SOURCES } = await import('@/lib/feedback-funnel/schema');
    const source = (ATTRIBUTION_SOURCES as readonly string[]).includes(v.attributionSource ?? '')
      ? (v.attributionSource as (typeof ATTRIBUTION_SOURCES)[number])
      : undefined;
    const viewer = await resolveOptionalViewer();

    // İdempotency yanıtı göndericiye BAĞLI (oturumlu: kullanıcı, oturumsuz: istemci kimliği):
    // sızan bir anahtarla başkasının yanıtı (geri bildirim kimliği, ödül durumu) oynatılamaz.
    const idemRoute = `feedback:${viewer ? `u:${viewer.userId}` : `c:${clientId}`}`;
    const idemCheck = await checkIdempotency(request, idemRoute);
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;
    const result = await submitFeedback(
      { id: v.qrCodeId },
      {
        rating: Math.round(v.rating),
        text: v.text,
        npsScore: v.npsScore != null ? Math.round(v.npsScore) : null,
        staffId: v.dealerStaffId ?? null,
        media: (v.media ?? []).map((m) => (typeof m === 'string' ? m : m.url)),
        attribution: { source, utmSource: v.utmSource, utmCampaign: v.utmCampaign, utmMedium: v.utmMedium },
      },
      { viewer, clientId }
    );

    const r = result.reward;
    const resBody = {
      success: true,
      feedback: { id: result.feedbackId, createdAt: result.createdAt },
      reward:
        r.status === 'credited' || r.status === 'capped'
          ? { points: r.points, xp: r.xp, newLevel: r.level, leveledUp: r.leveledUp, squadContribution: r.squadContribution }
          : null,
      rewardStatus: r.status,
    };
    if (idemKey) await storeIdempotency(idemKey, idemRoute, 200, resBody);
    return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const { ApiError } = await import('@/lib/http/define-route');
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(error.headers ?? {}) } }
      );
    }
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
