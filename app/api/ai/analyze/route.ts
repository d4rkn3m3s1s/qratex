import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  analyzeWithFallback,
  analyzeComprehensive,
  analyzeBulk,
  clusterThemes,
  generateInsightReport,
  askAI,
  getRecentUsageLogs,
} from '@/lib/ai-engine';
import { AiCostLimitExceededError } from '@/lib/ai-cost-guard';
import { generateInsights, chatWithAI } from '@/lib/openai';
import { z } from 'zod';
import type { AITheme } from '@/types';

export const dynamic = 'force-dynamic';

// Rate limit: DB-backed (serverless'te in-memory Map cold start'ta sıfırlanıyordu).
const RATE_LIMIT = 20; // dakikada istek

function normalizeSentimentPercentages(counts: { positive: number; negative: number; neutral: number }) {
  const total = counts.positive + counts.negative + counts.neutral;
  if (total <= 0) return { positive: 0, negative: 0, neutral: 0 };

  const raw = {
    positive: (counts.positive / total) * 100,
    negative: (counts.negative / total) * 100,
    neutral: (counts.neutral / total) * 100,
  };

  let rounded = {
    positive: Math.round(raw.positive),
    negative: Math.round(raw.negative),
    neutral: Math.round(raw.neutral),
  };

  let diff = 100 - (rounded.positive + rounded.negative + rounded.neutral);
  if (diff !== 0) {
    const priorities = (['positive', 'negative', 'neutral'] as const)
      .map((k) => ({ key: k, frac: raw[k] - Math.floor(raw[k]) }))
      .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));
    for (const p of priorities) {
      if (diff === 0) break;
      rounded[p.key] += diff > 0 ? 1 : -1;
      diff += diff > 0 ? -1 : 1;
    }
  }

  return rounded;
}

// ── Validation Schemas ──
const analyzeSchema = z.object({
  text: z.string().min(5, 'Metin en az 5 karakter olmalı').max(5000),
  feedbackId: z.string().optional(),
});

const bulkAnalyzeSchema = z.object({
  feedbackIds: z.array(z.string()).min(1).max(50),
});

const insightsSchema = z.object({
  qrCodeId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  period: z.string().optional(), // "2026-02", "2026-W06"
  type: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  conversationId: z.string().optional(),
});

const askAISchema = z.object({
  question: z.string().min(1).max(1000),
  conversationId: z.string().optional(),
});

const themeClusterSchema = z.object({
  period: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────
// POST /api/ai/analyze - AI Operations
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const rlAnalyze = await checkRateLimitDb(`ai_analyze:${session.user.id}`, RATE_LIMIT, 60_000);
    if (!rlAnalyze.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Retry-After': String(Math.ceil((rlAnalyze.retryAfterMs ?? 60_000) / 1000)),
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'analyze';
    const body = await request.json();

    switch (action) {
      // ── Tekil Feedback Analizi ──
      case 'analyze': {
        const validatedData = analyzeSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const { text, feedbackId } = validatedData.data;
        const dealerId = session.user.role === 'DEALER' ? session.user.id : undefined;
        let analysis;
        try {
          analysis = await analyzeWithFallback(text, { dealerId });
        } catch (e) {
          if (e instanceof AiCostLimitExceededError) {
            return NextResponse.json(
              { error: e.message },
              {
                status: 429,
                headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': '3600' },
              }
            );
          }
          throw e;
        }

        // Update feedback if feedbackId provided
        if (feedbackId) {
          await prisma.feedback.update({
            where: { id: feedbackId },
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
        }

        // Log AI usage to DB
        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'ai_analysis',
            category: 'ai',
            data: {
              textLength: text.length,
              feedbackId,
              model: analysis.modelUsed,
              hasExperienceSignals: !!analysis.intent,
            },
          },
        });

        return NextResponse.json({ success: true, analysis }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── Toplu Analiz ──
      case 'bulk_analyze': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const validatedData = bulkAnalyzeSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const { feedbackIds } = validatedData.data;

        // Fetch feedbacks
        const feedbacks = await prisma.feedback.findMany({
          where: {
            id: { in: feedbackIds },
            text: { not: null },
            ...(session.user.role === 'DEALER' ? { qrCode: { dealerId: session.user.id } } : {}),
          },
          select: { id: true, text: true },
        });

        const textsToAnalyze = feedbacks
          .filter(f => f.text && f.text.trim().length >= 5)
          .map(f => ({ id: f.id, text: f.text! }));

        if (textsToAnalyze.length === 0) {
          return NextResponse.json({ success: true, analyzed: 0 }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Bulk analyze
        const results = await analyzeBulk(textsToAnalyze);

        // Update all feedbacks
        let updatedCount = 0;
        for (const [fbId, analysis] of Array.from(results.entries())) {
          try {
            await prisma.feedback.update({
              where: { id: fbId },
              data: {
                sentiment: analysis.sentiment.label,
                emotions: analysis.emotions.map((e: { label: string }) => e.label),
                topics: analysis.topics,
                isToxic: analysis.toxicity.isToxic,
                aiAnalysis: JSON.parse(JSON.stringify(analysis)),
                intent: analysis.intent?.label || null,
                intentScore: analysis.intent?.score || null,
                urgency: analysis.urgency || null,
                effortScore: analysis.effortScore || null,
                churnRisk: analysis.churnRisk || null,
                entities: analysis.entities ? JSON.parse(JSON.stringify(analysis.entities)) : null,
                themes: analysis.themes ? JSON.parse(JSON.stringify(analysis.themes)) : null,
                statementSentiments: analysis.statementSentiments ? JSON.parse(JSON.stringify(analysis.statementSentiments)) : null,
                actionSuggestions: analysis.actionSuggestions ? JSON.parse(JSON.stringify(analysis.actionSuggestions)) : null,
                aiProcessedAt: new Date(),
                aiModelUsed: analysis.modelUsed || null,
                aiVersion: analysis.version || null,
              },
            });
            updatedCount++;
          } catch (err) {
            console.error(`Failed to update feedback ${fbId}:`, err);
          }
        }

        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'ai_bulk_analysis',
            category: 'ai',
            data: { requested: feedbackIds.length, analyzed: updatedCount },
          },
        });

        return NextResponse.json({ success: true, analyzed: updatedCount, total: feedbackIds.length }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── Tema Kümeleme ──
      case 'theme_clusters': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const validatedData = themeClusterSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const where: Record<string, unknown> = {};
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
        }

        const { startDate, endDate, period } = validatedData.data;
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
          if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
        }

        // Sadece text olan feedback'leri al
        where.text = { not: null };

        const feedbacks = await prisma.feedback.findMany({
          where,
          select: {
            text: true,
            sentiment: true,
            rating: true,
            themes: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        if (feedbacks.length < 3) {
          return NextResponse.json({
            success: true,
            clusters: [],
            message: 'Yeterli geri bildirim verisi yok (en az 3 gerekli).',
          }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        const clusters = await clusterThemes(
          feedbacks.map(f => ({
            text: f.text!,
            sentiment: f.sentiment || undefined,
            rating: f.rating,
            themes: f.themes as unknown as AITheme[] | undefined,
          })),
          period || new Date().toISOString().slice(0, 7)
        );

        // Save clusters to DB
        const dealerId = session.user.role === 'DEALER' ? session.user.id : 'system';
        const periodStr = period || new Date().toISOString().slice(0, 7);

        for (const cluster of clusters) {
          try {
            await prisma.aIThemeCluster.upsert({
              where: {
                dealerId_period_theme_subTheme: {
                  dealerId,
                  period: periodStr,
                  theme: cluster.theme,
                  subTheme: cluster.subTheme || '',
                },
              },
              update: {
                sentiment: cluster.sentiment,
                count: cluster.count,
                avgScore: cluster.avgScore,
                keywords: cluster.keywords || [],
                sampleTexts: cluster.sampleTexts || [],
              },
              create: {
                dealerId,
                period: periodStr,
                theme: cluster.theme,
                subTheme: cluster.subTheme || '',
                sentiment: cluster.sentiment,
                count: cluster.count,
                avgScore: cluster.avgScore,
                keywords: cluster.keywords || [],
                sampleTexts: cluster.sampleTexts || [],
              },
            });
          } catch (err) {
            console.error('Failed to save theme cluster:', err);
          }
        }

        return NextResponse.json({ success: true, clusters }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── AI İçgörü Raporu ──
      case 'insights': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const validatedData = insightsSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const { qrCodeId, startDate, endDate, period, type } = validatedData.data;

        const where: Record<string, unknown> = {};
        const consumptionWhere: Record<string, unknown> = {};
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
          consumptionWhere.consumption = { dealerId: session.user.id };
        }
        if (qrCodeId) where.qrCodeId = qrCodeId;
        if (startDate || endDate) {
          where.createdAt = {};
          consumptionWhere.createdAt = {};
          if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
          if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
          if (startDate) (consumptionWhere.createdAt as Record<string, unknown>).gte = new Date(startDate);
          if (endDate) (consumptionWhere.createdAt as Record<string, unknown>).lte = new Date(endDate);
        }

        const [feedbacks, consumptionReviews] = await Promise.all([
          prisma.feedback.findMany({
            where,
            select: {
              rating: true,
              sentiment: true,
              topics: true,
              text: true,
              intent: true,
              urgency: true,
              churnRisk: true,
              themes: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
          }),
          prisma.consumptionReview.findMany({
            where: consumptionWhere,
            select: {
              rating: true,
              text: true,
              dimensions: true,
              createdAt: true,
              consumption: { select: { dealerId: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
          }),
        ]);

        const normalizedConsumption = consumptionReviews.map((r) => ({
          rating: r.rating,
          sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
          topics: [] as string[],
          text: r.text,
          intent: null as string | null,
          urgency: null as number | null,
          churnRisk: null as number | null,
          themes: null as unknown,
          createdAt: r.createdAt,
        }));

        const allReviews = [...feedbacks, ...normalizedConsumption];

        if (allReviews.length < 3) {
          return NextResponse.json({
            success: true,
            insights: null,
            message: 'Yeterli geri bildirim verisi yok (en az 3 gerekli).',
          }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Calculate stats
        const totalCount = allReviews.length;
        const avgRating = allReviews.reduce((acc, f) => acc + f.rating, 0) / totalCount;

        const sentimentCounts = allReviews.reduce(
          (acc, f) => {
            if (f.sentiment) acc[f.sentiment as keyof typeof acc]++;
            return acc;
          },
          { positive: 0, negative: 0, neutral: 0 }
        );

        const sentimentDist = normalizeSentimentPercentages(sentimentCounts);

        // Top topics
        const topicCounts: Record<string, number> = {};
        allReviews.forEach(f => {
          const topics = f.topics as string[] | null;
          topics?.forEach(topic => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          });
        });
        const topTopics = Object.entries(topicCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([topic, count]) => ({ topic, count }));

        // Theme clusters
        const themeClusters = await clusterThemes(
          allReviews.filter(f => f.text).map(f => ({
            text: f.text!,
            sentiment: f.sentiment || undefined,
            rating: f.rating,
            themes: f.themes as unknown as AITheme[] | undefined,
          })),
          period || new Date().toISOString().slice(0, 7)
        );

        // Recent feedbacks
        const recentFeedbacks = allReviews
          .filter(f => f.text)
          .slice(0, 25)
          .map(f => ({
            text: f.text!,
            rating: f.rating,
            sentiment: f.sentiment || 'neutral',
            intent: f.intent || undefined,
            urgency: f.urgency || undefined,
            churnRisk: f.churnRisk || undefined,
          }));

        // Intent & signals summary for deeper AI context
        const intentSummary: Record<string, number> = {};
        let highUrgencyCount = 0;
        let highChurnCount = 0;
        allReviews.forEach(f => {
          const intent = (f.intent || 'general').toLowerCase();
          intentSummary[intent] = (intentSummary[intent] ?? 0) + 1;
          if (f.urgency != null && f.urgency >= 0.7) highUrgencyCount++;
          if (f.churnRisk != null && f.churnRisk >= 0.5) highChurnCount++;
        });

        // Check for previous period report
        const dealerId = session.user.role === 'DEALER' ? session.user.id : 'system';
        let previousPeriodScore: number | undefined;
        try {
          const prevReport = await prisma.aIInsightReport.findFirst({
            where: { dealerId },
            orderBy: { generatedAt: 'desc' },
            select: { overallScore: true },
          });
          if (prevReport) previousPeriodScore = prevReport.overallScore;
        } catch {
          // ignore
        }

        // Generate comprehensive report (with extra context for ML-style analysis)
        const report = await generateInsightReport({
          dealerId,
          period: period || new Date().toISOString().slice(0, 7),
          totalFeedbacks: totalCount,
          avgRating,
          sentimentDist,
          topTopics,
          themeClusters,
          recentFeedbacks,
          previousPeriodScore,
          intentSummary,
          signalsSummary: { highUrgencyCount, highChurnCount },
        });

        // Save report to DB
        if (report) {
          const periodStr = period || new Date().toISOString().slice(0, 7);
          const reportType = type || 'monthly';
          try {
            await prisma.aIInsightReport.upsert({
              where: {
                dealerId_period_type: {
                  dealerId,
                  period: periodStr,
                  type: reportType,
                },
              },
              update: {
                overallScore: report.overallScore,
                trend: report.trend,
                trendValue: report.trendValue,
                totalFeedbacks: report.totalFeedbacks,
                summary: report.summary,
                strengths: JSON.parse(JSON.stringify(report.strengths)),
                weaknesses: JSON.parse(JSON.stringify(report.weaknesses)),
                recommendations: JSON.parse(JSON.stringify(report.recommendations)),
                alerts: JSON.parse(JSON.stringify(report.alerts)),
                keyDrivers: JSON.parse(JSON.stringify(report.keyDrivers)),
                predictedRating: report.predictedRating,
                keyMetrics: JSON.parse(JSON.stringify(report.keyMetrics)),
                generatedAt: new Date(),
              },
              create: {
                dealerId,
                period: periodStr,
                type: reportType,
                overallScore: report.overallScore,
                trend: report.trend,
                trendValue: report.trendValue,
                totalFeedbacks: report.totalFeedbacks,
                summary: report.summary,
                strengths: JSON.parse(JSON.stringify(report.strengths)),
                weaknesses: JSON.parse(JSON.stringify(report.weaknesses)),
                recommendations: JSON.parse(JSON.stringify(report.recommendations)),
                alerts: JSON.parse(JSON.stringify(report.alerts)),
                keyDrivers: JSON.parse(JSON.stringify(report.keyDrivers)),
                predictedRating: report.predictedRating,
                keyMetrics: JSON.parse(JSON.stringify(report.keyMetrics)),
              },
            });
          } catch (err) {
            console.error('Failed to save insight report:', err);
          }
        }

        // Legacy text insights (fallback)
        let legacyInsights: string | null = null;
        if (!report) {
          legacyInsights = await generateInsights({
            totalCount,
            averageRating: avgRating,
            sentimentDistribution: sentimentDist,
            topTopics: topTopics.map(t => t.topic),
            recentFeedbacks: recentFeedbacks.map(f => ({
              text: f.text,
              rating: f.rating,
              sentiment: f.sentiment,
            })),
          });
        }

        return NextResponse.json({
          success: true,
          report,
          insights: legacyInsights,
          stats: {
            totalCount,
            averageRating: avgRating,
            sentimentDistribution: sentimentDist,
            sentimentCounts,
            topTopics,
          },
          themeClusters,
        }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── Ask AI (Doğal Dil Sorgulama) ── Tüm roller erişebilir
      case 'ask': {
        const validatedData = askAISchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const { question, conversationId } = validatedData.data;
        const conversationUserId = session.user.id;

        let ownedConversation: { messages: unknown } | null = null;
        if (conversationId) {
          ownedConversation = await prisma.aIConversation.findUnique({
            where: { id: conversationId, dealerId: conversationUserId },
            select: { messages: true },
          });
          if (!ownedConversation) {
            return NextResponse.json(
              { error: 'Sohbet bulunamadı' },
              { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
          }
        }

        // Role-based data scoping
        const where: Record<string, unknown> = {};
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
        } else if (session.user.role === 'CUSTOMER') {
          where.userId = session.user.id;
        }
        // ADMIN: tüm verilere erişir (filtre yok)

        const [feedbackStats, recentFeedbacks, themeClusters] = await Promise.all([
          prisma.feedback.aggregate({
            where,
            _count: true,
            _avg: { rating: true },
          }),
          prisma.feedback.findMany({
            where: { ...where, text: { not: null } },
            select: { text: true, rating: true, sentiment: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 15,
          }),
          prisma.aIThemeCluster.findMany({
            where: {
              dealerId: session.user.role === 'DEALER' ? session.user.id : undefined,
            },
            orderBy: { count: 'desc' },
            take: 10,
          }),
        ]);

        // Sentiment distribution
        const sentimentResults = await prisma.feedback.groupBy({
          by: ['sentiment'],
          where,
          _count: true,
        });
        const sentimentDist2 = normalizeSentimentPercentages({
          positive: sentimentResults.find(s => s.sentiment === 'positive')?._count || 0,
          negative: sentimentResults.find(s => s.sentiment === 'negative')?._count || 0,
          neutral: sentimentResults.find(s => s.sentiment === 'neutral')?._count || 0,
        });

        // Top topics
        const allFeedbacks = await prisma.feedback.findMany({
          where,
          select: { topics: true },
          take: 200,
        });
        const topicCounts2: Record<string, number> = {};
        allFeedbacks.forEach(f => {
          const topics = f.topics as string[] | null;
          topics?.forEach(t => { topicCounts2[t] = (topicCounts2[t] || 0) + 1; });
        });
        const topTopics2 = Object.entries(topicCounts2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([topic, count]) => ({ topic, count }));

        // Intent distribution, urgency/churn summary, last 7 days trend
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const where7d = { ...where, createdAt: { gte: sevenDaysAgo } };
        const [intentDist, urgencyChurn, recentByDate] = await Promise.all([
          prisma.feedback.groupBy({
            by: ['intent'],
            where,
            _count: true,
          }).then(g => {
            const m: Record<string, number> = {};
            g.forEach(r => { m[String(r.intent || 'general')] = r._count; });
            return m;
          }),
          Promise.all([
            prisma.feedback.count({ where: { ...where, urgency: { gte: 0.7 } } }),
            prisma.feedback.count({ where: { ...where, churnRisk: { gte: 0.7 } } }),
          ]).then(([highUrgency, highChurn]) => ({ highUrgencyCount: highUrgency, highChurnCount: highChurn })),
          prisma.feedback.findMany({
            where: where7d,
            select: { createdAt: true },
          }),
        ]);

        const dateCounts: Record<string, number> = {};
        recentByDate.forEach(f => {
          const d = f.createdAt.toISOString().slice(0, 10);
          dateCounts[d] = (dateCounts[d] || 0) + 1;
        });
        const last7DaysTrend = Object.entries(dateCounts)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));

        // Previous messages from conversation (son 12 mesaj - çok turlu sohbet)
        let previousMessages: { role: 'user' | 'assistant'; content: string }[] = [];
        if (ownedConversation?.messages) {
          previousMessages = (
            ownedConversation.messages as { role: 'user' | 'assistant'; content: string }[]
          ).slice(-12);
        }

        const answer = await askAI(question, {
          totalFeedbacks: feedbackStats._count,
          avgRating: feedbackStats._avg.rating || 0,
          sentimentDist: sentimentDist2,
          topTopics: topTopics2,
          recentFeedbacks: recentFeedbacks.map(f => ({
            text: f.text!,
            rating: f.rating,
            sentiment: f.sentiment || 'neutral',
            createdAt: f.createdAt.toISOString(),
          })),
          themeClusters: themeClusters.map(tc => ({
            theme: tc.theme,
            subTheme: tc.subTheme || undefined,
            sentiment: tc.sentiment,
            count: tc.count,
            avgScore: tc.avgScore,
          })),
          intentDist: Object.keys(intentDist).length > 0 ? intentDist : undefined,
          urgencyChurnSummary: urgencyChurn,
          last7DaysTrend: last7DaysTrend.length > 0 ? last7DaysTrend : undefined,
          previousMessages,
        });

        // Save conversation (dealerId alanı tüm roller için userId olarak kullanılır)
        let savedConversationId = conversationId;
        try {
          if (conversationId && ownedConversation) {
            const msgs =
              (ownedConversation.messages as { role: string; content: string; timestamp: string }[]) || [];
            msgs.push(
              { role: 'user', content: question, timestamp: new Date().toISOString() },
              { role: 'assistant', content: answer || '', timestamp: new Date().toISOString() }
            );
            await prisma.aIConversation.updateMany({
              where: { id: conversationId, dealerId: conversationUserId },
              data: { messages: msgs, updatedAt: new Date() },
            });
          } else {
            const conv = await prisma.aIConversation.create({
              data: {
                dealerId: conversationUserId,
                title: question.slice(0, 100),
                messages: [
                  { role: 'user', content: question, timestamp: new Date().toISOString() },
                  { role: 'assistant', content: answer || '', timestamp: new Date().toISOString() },
                ],
              },
            });
            savedConversationId = conv.id;
          }
        } catch (err) {
          console.error('Failed to save conversation:', err);
        }

        return NextResponse.json({
          success: true,
          answer,
          conversationId: savedConversationId,
        }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── AI Chat (Legacy) ──
      case 'chat': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const validatedData = chatSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const { message } = validatedData.data;

        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { businessName: true, role: true },
        });

        const context = user?.businessName
          ? `İşletme: ${user.businessName}`
          : undefined;

        const response = await chatWithAI(message, context);

        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'ai_chat_used',
            category: 'ai',
            data: { messageLength: message.length },
          },
        });

        return NextResponse.json({ success: true, response }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── AI Settings ──
      case 'get_settings': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // ADMIN: belirli dealer ayarlarını veya tüm ayarları getirebilir
        if (session.user.role === 'ADMIN' && body?.dealerId) {
          const settings = await prisma.aISettings.findUnique({
            where: { dealerId: body.dealerId },
          });
          return NextResponse.json({
            success: true,
            settings: settings || getDefaultAISettings(),
          }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        if (session.user.role === 'ADMIN' && body?.all) {
          const allSettings = await prisma.aISettings.findMany({
            include: { dealer: { select: { id: true, name: true, businessName: true } } },
          });
          return NextResponse.json({ success: true, allSettings }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        const settings = await prisma.aISettings.findUnique({
          where: { dealerId: session.user.id },
        });

        return NextResponse.json({
          success: true,
          settings: settings || getDefaultAISettings(),
        }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'update_settings': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const settingsData = body;
        // ADMIN belirli dealer ayarlarını güncelleyebilir
        const targetDealerId = (session.user.role === 'ADMIN' && settingsData.dealerId)
          ? settingsData.dealerId
          : session.user.id;
        const updated = await prisma.aISettings.upsert({
          where: { dealerId: targetDealerId },
          update: {
            isEnabled: settingsData.isEnabled,
            autoAnalyze: settingsData.autoAnalyze,
            analysisLanguage: settingsData.analysisLanguage,
            sentimentEnabled: settingsData.sentimentEnabled,
            emotionEnabled: settingsData.emotionEnabled,
            topicEnabled: settingsData.topicEnabled,
            intentEnabled: settingsData.intentEnabled,
            urgencyEnabled: settingsData.urgencyEnabled,
            entityEnabled: settingsData.entityEnabled,
            toxicityEnabled: settingsData.toxicityEnabled,
            churnEnabled: settingsData.churnEnabled,
            themeClusterEnabled: settingsData.themeClusterEnabled,
            weeklyReportEnabled: settingsData.weeklyReportEnabled,
            monthlyReportEnabled: settingsData.monthlyReportEnabled,
            alertOnToxic: settingsData.alertOnToxic,
            alertOnUrgent: settingsData.alertOnUrgent,
            alertOnChurnRisk: settingsData.alertOnChurnRisk,
            customPrompt: settingsData.customPrompt,
          },
          create: {
            dealerId: targetDealerId,
            isEnabled: settingsData.isEnabled ?? true,
            autoAnalyze: settingsData.autoAnalyze ?? true,
            analysisLanguage: settingsData.analysisLanguage ?? 'tr',
            sentimentEnabled: settingsData.sentimentEnabled ?? true,
            emotionEnabled: settingsData.emotionEnabled ?? true,
            topicEnabled: settingsData.topicEnabled ?? true,
            intentEnabled: settingsData.intentEnabled ?? true,
            urgencyEnabled: settingsData.urgencyEnabled ?? true,
            entityEnabled: settingsData.entityEnabled ?? true,
            toxicityEnabled: settingsData.toxicityEnabled ?? true,
            churnEnabled: settingsData.churnEnabled ?? true,
            themeClusterEnabled: settingsData.themeClusterEnabled ?? true,
            weeklyReportEnabled: settingsData.weeklyReportEnabled ?? true,
            monthlyReportEnabled: settingsData.monthlyReportEnabled ?? true,
            alertOnToxic: settingsData.alertOnToxic ?? true,
            alertOnUrgent: settingsData.alertOnUrgent ?? true,
            alertOnChurnRisk: settingsData.alertOnChurnRisk ?? true,
            customPrompt: settingsData.customPrompt,
          },
        });

        return NextResponse.json({ success: true, settings: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      // ── AI Usage Stats ──
      case 'usage_stats': {
        if (session.user.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const logs = getRecentUsageLogs(100);
        const dbLogs = await prisma.aIUsageLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        return NextResponse.json({
          success: true,
          recentLogs: logs,
          dbLogs,
        }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      default:
        return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
  } catch (error) {
    console.error('Error in AI endpoint:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'AI analizi sırasında bir hata oluştu' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// Default AI settings
function getDefaultAISettings() {
  return {
    isEnabled: true,
    autoAnalyze: true,
    analysisLanguage: 'tr',
    sentimentEnabled: true,
    emotionEnabled: true,
    topicEnabled: true,
    intentEnabled: true,
    urgencyEnabled: true,
    entityEnabled: true,
    toxicityEnabled: true,
    churnEnabled: true,
    themeClusterEnabled: true,
    weeklyReportEnabled: true,
    monthlyReportEnabled: true,
    alertOnToxic: true,
    alertOnUrgent: true,
    alertOnChurnRisk: true,
    customPrompt: null,
  };
}