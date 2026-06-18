import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, clampTakeParam } from '@/lib/api-http';

// ─────────────────────────────────────────────────────────────
// GET /api/ai/detailed - Detaylı AI Feedback Verileri
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

const AI_DETAILED_AGG_SAMPLE_MAX = 6_000;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (session.user.role === 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = clampTakeParam(searchParams.get('limit'), 50, 100);

    const where: Record<string, unknown> = { text: { not: null } };
    if (session.user.role === 'DEALER') {
      where.qrCode = { dealerId: session.user.id };
    }

    // İki sorgu birbirinden bağımsız → paralel (önceden sıralı await'ti).
    const [detailedFeedbacks, allFeedbacks] = await Promise.all([
      // Detaylı feedbacklar
      prisma.feedback.findMany({
        where,
        select: {
          id: true, text: true, rating: true, sentiment: true, emotions: true,
          topics: true, isToxic: true, intent: true, intentScore: true,
          urgency: true, effortScore: true, churnRisk: true, entities: true,
          themes: true, statementSentiments: true, actionSuggestions: true,
          aiProcessedAt: true, aiModelUsed: true, aiVersion: true, createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      // Tüm feedbacklardan aggregation
      prisma.feedback.findMany({
        where: {
          ...(session.user.role === 'DEALER' ? { qrCode: { dealerId: session.user.id } } : {}),
          text: { not: null },
        },
        select: {
          intent: true, urgency: true, effortScore: true, churnRisk: true,
          entities: true, themes: true, actionSuggestions: true,
          sentiment: true, emotions: true, rating: true,
        },
        orderBy: { createdAt: 'desc' },
        take: AI_DETAILED_AGG_SAMPLE_MAX,
      }),
    ]);

    // ── Intent Distribution ──
    const intentDist: Record<string, number> = { complaint: 0, suggestion: 0, praise: 0, question: 0, general: 0 };
    allFeedbacks.forEach(f => {
      if (f.intent && intentDist[f.intent] !== undefined) intentDist[f.intent]++;
    });

    // ── Urgency Buckets ──
    const urgencyBuckets = { low: 0, medium: 0, high: 0, critical: 0 };
    allFeedbacks.forEach(f => {
      if (f.urgency != null) {
        if (f.urgency < 0.3) urgencyBuckets.low++;
        else if (f.urgency < 0.5) urgencyBuckets.medium++;
        else if (f.urgency < 0.7) urgencyBuckets.high++;
        else urgencyBuckets.critical++;
      }
    });

    // ── Churn Risk Buckets ──
    const churnBuckets = { safe: 0, low: 0, medium: 0, high: 0 };
    allFeedbacks.forEach(f => {
      if (f.churnRisk != null) {
        if (f.churnRisk < 0.25) churnBuckets.safe++;
        else if (f.churnRisk < 0.5) churnBuckets.low++;
        else if (f.churnRisk < 0.75) churnBuckets.medium++;
        else churnBuckets.high++;
      }
    });

    // ── Avg Effort Score ──
    const effortArr = allFeedbacks.filter(f => f.effortScore != null).map(f => f.effortScore!);
    const avgEffort = effortArr.length > 0 ? effortArr.reduce((a, b) => a + b, 0) / effortArr.length : 0;

    // ── Avg Urgency ──
    const urgencyArr = allFeedbacks.filter(f => f.urgency != null).map(f => f.urgency!);
    const avgUrgency = urgencyArr.length > 0 ? urgencyArr.reduce((a, b) => a + b, 0) / urgencyArr.length : 0;

    // ── Avg Churn Risk ──
    const churnArr = allFeedbacks.filter(f => f.churnRisk != null).map(f => f.churnRisk!);
    const avgChurnRisk = churnArr.length > 0 ? churnArr.reduce((a, b) => a + b, 0) / churnArr.length : 0;

    // ── Entity Aggregation ──
    const entityMap = new Map<string, { name: string; type: string; count: number; sentiments: string[] }>();
    allFeedbacks.forEach(f => {
      const raw = f.entities;
      const ents = (Array.isArray(raw) ? raw.filter((e: any) => e && typeof e === 'object' && e.name) : []) as { type: string; name: string; sentiment: string }[];
      ents.forEach(e => {
        const key = `${e.type}:${e.name}`;
        const ex = entityMap.get(key);
        if (ex) { ex.count++; ex.sentiments.push(e.sentiment || 'neutral'); }
        else entityMap.set(key, { name: e.name, type: e.type || 'other', count: 1, sentiments: [e.sentiment || 'neutral'] });
      });
    });
    const topEntities = Array.from(entityMap.values())
      .sort((a, b) => b.count - a.count).slice(0, 25)
      .map(e => ({
        name: e.name,
        type: e.type,
        count: e.count,
        posRate: Math.round((e.sentiments.filter(s => s === 'positive').length / e.sentiments.length) * 100),
        negRate: Math.round((e.sentiments.filter(s => s === 'negative').length / e.sentiments.length) * 100),
        neuRate: Math.round((e.sentiments.filter(s => s === 'neutral').length / e.sentiments.length) * 100),
      }));

    // ── Emotion Aggregation ──
    const emotionMap = new Map<string, number>();
    allFeedbacks.forEach(f => {
      const raw = f.emotions;
      const emos = (Array.isArray(raw) ? raw.filter((e: any) => typeof e === 'string') : []) as string[];
      emos.forEach(e => { emotionMap.set(e, (emotionMap.get(e) || 0) + 1); });
    });
    const topEmotions = Array.from(emotionMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([emotion, count]) => ({ emotion, count }));

    // ── Action Suggestions Aggregation ──
    const actionMap = new Map<string, { action: string; priority: string; impact: string; category: string; count: number }>();
    allFeedbacks.forEach(f => {
      const raw = f.actionSuggestions;
      const sgs = (Array.isArray(raw) ? raw.filter((s: any) => s && typeof s === 'object' && s.action) : []) as { action: string; priority: string; impact: string; category: string }[];
      sgs.forEach(s => {
        const key = s.action.toLowerCase().trim();
        const ex = actionMap.get(key);
        if (ex) ex.count++;
        else actionMap.set(key, { action: s.action, priority: s.priority || 'medium', impact: s.impact || '', category: s.category || 'other', count: 1 });
      });
    });
    const topActions = Array.from(actionMap.values())
      .sort((a, b) => {
        const po: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        return (po[b.priority] || 0) - (po[a.priority] || 0) || b.count - a.count;
      }).slice(0, 20);

    // ── Theme Aggregation ──
    const themeMap = new Map<string, { theme: string; subTheme?: string; count: number; sentiments: string[]; scores: number[] }>();
    allFeedbacks.forEach(f => {
      const raw = f.themes;
      const themes = (Array.isArray(raw) ? raw.filter((t: any) => t && typeof t === 'object' && t.theme) : []) as { theme: string; subTheme?: string; sentiment: string; score: number }[];
      themes.forEach(t => {
        const key = `${t.theme}|${t.subTheme || ''}`;
        const ex = themeMap.get(key);
        if (ex) { ex.count++; ex.sentiments.push(t.sentiment || 'neutral'); ex.scores.push(t.score || 0); }
        else themeMap.set(key, { theme: t.theme, subTheme: t.subTheme, count: 1, sentiments: [t.sentiment || 'neutral'], scores: [t.score || 0] });
      });
    });
    const topThemes = Array.from(themeMap.values())
      .sort((a, b) => b.count - a.count).slice(0, 15)
      .map(t => ({
        theme: t.theme,
        subTheme: t.subTheme,
        count: t.count,
        avgScore: t.scores.reduce((a, b) => a + b, 0) / t.scores.length,
        posRate: Math.round((t.sentiments.filter(s => s === 'positive').length / t.sentiments.length) * 100),
        negRate: Math.round((t.sentiments.filter(s => s === 'negative').length / t.sentiments.length) * 100),
      }));

    // ── Rating Distribution ──
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allFeedbacks.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) ratingDist[f.rating]++;
    });

    // ── Sentiment by Rating ──
    const sentimentByRating: Record<number, { positive: number; negative: number; neutral: number }> = {};
    for (let i = 1; i <= 5; i++) sentimentByRating[i] = { positive: 0, negative: 0, neutral: 0 };
    allFeedbacks.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5 && f.sentiment) {
        const s = f.sentiment as 'positive' | 'negative' | 'neutral';
        if (sentimentByRating[f.rating][s] !== undefined) sentimentByRating[f.rating][s]++;
      }
    });

    const totalAnalyzed = allFeedbacks.filter(f => f.intent || f.urgency != null).length;

    return NextResponse.json(
      {
        success: true,
        feedbacks: detailedFeedbacks,
        signals: {
          intentDist,
          urgencyBuckets,
          churnBuckets,
          avgEffort,
          avgUrgency,
          avgChurnRisk,
          topEntities,
          topEmotions,
          topActions,
          topThemes,
          ratingDist,
          sentimentByRating,
          totalAnalyzed,
          totalFeedbacks: allFeedbacks.length,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error in detailed AI endpoint:', error);
    return NextResponse.json(
      { error: 'Detaylı AI verileri alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
