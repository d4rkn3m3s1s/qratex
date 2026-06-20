import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { runChatCompletion } from '@/lib/ai-engine';
import { findSimilarFeedback } from '@/lib/ai-learning';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/ask-analytics — Konuşmalı analitik.
 * Dealer doğal dille sorar ("geçen hafta puanım neden düştü?"). Endpoint:
 *  1) işletmenin toplulaştırılmış metriklerini (sentiment, tema, churn, trend) toplar,
 *  2) soruyla anlamca ilgili feedback'leri semantik arama (embedding) ile getirir,
 *  3) bunları topraklanmış (grounded) bir prompt'la LLM'e verip sentez döndürür.
 * Yalnızca gerçek verilere dayanır; veri yoksa "veri yetersiz" der (uydurma yok).
 */
const schema = z.object({ question: z.string().min(3).max(500) });

const DAY = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

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

    const rl = await checkRateLimitDb(`ask_analytics:${session.user.id}`, 15, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
        { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz soru' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const question = parsed.data.question;

    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * DAY);
    const prev7 = new Date(now.getTime() - 14 * DAY);
    const baseWhere = { qrCode: { dealerId }, deletedAt: null };

    // 1) Toplulaştırılmış bağlam — tek pass'te paralel.
    const [thisWeekAgg, prevWeekAgg, sentimentRows, topThemes, churnHigh, relevant] = await Promise.all([
      prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: last7 } }, _avg: { rating: true }, _count: true }),
      prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: prev7, lt: last7 } }, _avg: { rating: true }, _count: true }),
      prisma.feedback.groupBy({
        by: ['sentiment'],
        where: { ...baseWhere, createdAt: { gte: last7 }, sentiment: { not: null } },
        _count: true,
      }),
      prisma.feedback.findMany({
        where: { ...baseWhere, createdAt: { gte: last7 }, topics: { not: Prisma.AnyNull } },
        select: { topics: true },
        take: 200,
      }),
      prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: last7 }, churnRisk: { gte: 0.7 } } }),
      // 2) Semantik ilgili feedback'ler (soruya göre).
      findSimilarFeedback({ dealerId, text: question, limit: 8, minScore: 0.3 }),
    ]);

    // Tema sayımı (JSON topics dizilerinden).
    const themeCounts = new Map<string, number>();
    for (const f of topThemes) {
      const arr = Array.isArray(f.topics) ? (f.topics as unknown[]) : [];
      for (const t of arr) {
        if (typeof t === 'string') themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
      }
    }
    const topThemeList = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // İlgili feedback detayları (metin + puan).
    let relevantSnippets: Array<{ text: string; rating: number; sentiment: string | null }> = [];
    if (relevant.length > 0) {
      const details = await prisma.feedback.findMany({
        where: { id: { in: relevant.map((r) => r.feedbackId) } },
        select: { id: true, text: true, rating: true, sentiment: true },
      });
      const byId = new Map(details.map((d) => [d.id, d]));
      relevantSnippets = relevant
        .map((r) => byId.get(r.feedbackId))
        .filter((d): d is NonNullable<typeof d> => !!d && !!d.text)
        .map((d) => ({ text: d.text!.slice(0, 280), rating: d.rating, sentiment: d.sentiment }));
    }

    const thisAvg = thisWeekAgg._avg.rating;
    const prevAvg = prevWeekAgg._avg.rating;
    const sentiments = Object.fromEntries(sentimentRows.map((s) => [s.sentiment, s._count]));

    // 3) Topraklanmış prompt.
    const contextBlock = [
      `Son 7 gün: ${thisWeekAgg._count} geri bildirim, ortalama puan ${thisAvg != null ? thisAvg.toFixed(2) : 'veri yok'}.`,
      `Önceki 7 gün: ${prevWeekAgg._count} geri bildirim, ortalama puan ${prevAvg != null ? prevAvg.toFixed(2) : 'veri yok'}.`,
      `Sentiment dağılımı (son 7 gün): ${JSON.stringify(sentiments)}.`,
      `En çok geçen konular: ${topThemeList.map(([t, n]) => `${t} (${n})`).join(', ') || 'yok'}.`,
      `Yüksek kayıp riski (churn ≥ 0.7) son 7 günde: ${churnHigh} geri bildirim.`,
      relevantSnippets.length > 0
        ? `Soruyla en ilgili geri bildirimler:\n${relevantSnippets.map((s, i) => `${i + 1}. [${s.rating}★/${s.sentiment ?? '?'}] ${s.text}`).join('\n')}`
        : 'Soruyla anlamca eşleşen belirgin geri bildirim bulunamadı.',
    ].join('\n');

    const answer = await runChatCompletion({
      dealerId,
      temperature: 0.4,
      maxTokens: 700,
      system:
        'Sen bir işletme analitiği asistanısın. SADECE verilen verilere dayanarak Türkçe, kısa ve aksiyona dönük yanıt ver. ' +
        'Veri yetersizse bunu açıkça söyle, sayı/iddia UYDURMA. Mümkünse somut bir sonraki adım öner.',
      user: `İşletme verisi:\n${contextBlock}\n\nSoru: ${question}`,
    });

    if (!answer) {
      return NextResponse.json(
        {
          error: 'AI yapılandırılmamış veya yanıt üretilemedi',
          context: { thisWeekCount: thisWeekAgg._count, thisAvg, prevAvg, topThemes: topThemeList, churnHigh },
        },
        { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        question,
        answer: answer.content,
        modelUsed: answer.modelUsed,
        grounding: {
          thisWeekCount: thisWeekAgg._count,
          thisAvgRating: thisAvg,
          prevAvgRating: prevAvg,
          topThemes: topThemeList.map(([theme, count]) => ({ theme, count })),
          churnHighCount: churnHigh,
          relevantCount: relevantSnippets.length,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ASK_ANALYTICS_ERROR]', error);
    return NextResponse.json({ error: 'Analiz yapılamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
