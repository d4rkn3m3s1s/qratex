import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { findSimilarFeedback } from '@/lib/ai-learning';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/feedbacks/[id]/similar
 * Bir feedback'e en benzer geçmiş feedback'leri (aynı bayi) embedding cosine
 * benzerliğiyle döndürür. Tekrarlayan şikâyet/temaları ve daha önce verilen
 * yanıtları yüzeye çıkarır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { id: true, text: true, qrCode: { select: { dealerId: true } } },
    });
    if (!feedback) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const dealerId = feedback.qrCode.dealerId;
    if (session.user.role === 'DEALER' && dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu geri bildirime erişim yetkiniz yok' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (!feedback.text || feedback.text.trim().length < 5) {
      return NextResponse.json({ similar: [], reason: 'no_text' }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const matches = (await findSimilarFeedback({ dealerId, text: feedback.text, limit: 6 }))
      .filter((m) => m.feedbackId !== id); // kendisini hariç tut

    if (matches.length === 0) {
      return NextResponse.json({ similar: [] }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Eşleşen feedback'lerin metin + puan + bayi yanıtını getir.
    const details = await prisma.feedback.findMany({
      where: { id: { in: matches.map((m) => m.feedbackId) } },
      select: {
        id: true,
        text: true,
        rating: true,
        sentiment: true,
        dealerReply: true,
        createdAt: true,
      },
    });
    const byId = new Map(details.map((d) => [d.id, d]));

    const similar = matches
      .map((m) => {
        const d = byId.get(m.feedbackId);
        if (!d) return null;
        return {
          id: d.id,
          score: Number(m.score.toFixed(3)),
          text: d.text,
          rating: d.rating,
          sentiment: d.sentiment,
          dealerReply: d.dealerReply,
          createdAt: d.createdAt,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ similar }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('[SIMILAR_FEEDBACK_ERROR]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Benzer geri bildirimler getirilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
