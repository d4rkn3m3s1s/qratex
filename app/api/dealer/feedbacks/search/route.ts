import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { findSimilarFeedback } from '@/lib/ai-learning';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(30).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/dealer/feedbacks/search
 * Serbest metin semantik arama: "soğuk yemek" yaz → anlamca benzeyen TÜM feedback'ler
 * (keyword değil embedding cosine). Tekrarlayan şikâyetleri/temaları yüzeye çıkarır.
 * Embedding altyapısını (AIEmbedding + findSimilarFeedback) gerçek bir özelliğe çevirir.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    // Dealer kapsamı: DEALER kendi id'si, STAFF bağlı olduğu dealer, ADMIN query ile.
    let dealerId: string;
    if (session.user.role === 'STAFF') {
      const staffDealer = getStaffDealerId(session);
      if (staffDealer instanceof NextResponse) return staffDealer;
      dealerId = staffDealer;
    } else if (session.user.role === 'ADMIN') {
      const qp = new URL(request.url).searchParams.get('dealerId');
      if (!qp) {
        return NextResponse.json({ error: 'Admin için dealerId query gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      dealerId = qp;
    } else {
      dealerId = session.user.id;
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz sorgu' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const matches = await findSimilarFeedback({
      dealerId,
      text: parsed.data.query,
      limit: parsed.data.limit ?? 15,
      minScore: parsed.data.minScore ?? 0.35,
    });

    if (matches.length === 0) {
      return NextResponse.json({ query: parsed.data.query, results: [], count: 0 }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const details = await prisma.feedback.findMany({
      where: { id: { in: matches.map((m) => m.feedbackId) }, deletedAt: null },
      select: {
        id: true,
        text: true,
        rating: true,
        sentiment: true,
        intent: true,
        topics: true,
        dealerReply: true,
        createdAt: true,
      },
    });
    const byId = new Map(details.map((d) => [d.id, d]));

    const results = matches
      .map((m) => {
        const d = byId.get(m.feedbackId);
        if (!d) return null;
        return {
          id: d.id,
          score: Number(m.score.toFixed(3)),
          text: d.text,
          rating: d.rating,
          sentiment: d.sentiment,
          intent: d.intent,
          topics: d.topics,
          dealerReply: d.dealerReply,
          createdAt: d.createdAt,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { query: parsed.data.query, results, count: results.length },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[FEEDBACK_SEARCH_ERROR]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Arama yapılamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
