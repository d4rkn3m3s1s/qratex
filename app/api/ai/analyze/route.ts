import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  analyzeWithFallback,
  analyzeComprehensive,
  analyzeBulk,
  clusterThemes,
  generateInsightReport,
  askAI,
  getRecentUsageLogs,
} from '@/lib/ai-engine';
import { generateInsights, chatWithAI } from '@/lib/openai';
import { z } from 'zod';
import type { AITheme } from '@/types';

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }

  userLimit.count++;
  return true;
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit(session.user.id)) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
        { status: 429 }
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
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
        }

        const { text, feedbackId } = validatedData.data;
        const analysis = await analyzeWithFallback(text);

        // Update feedback if feedbackId provided
        if (feedbackId) {
          await prisma.feedback.update({
            where: { id: feedbackId },
            data: {
              sentiment: analysis.sentiment.label,
              emotions: analysis.emotions.map((e: { label: string }) => e.label),
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

        return NextResponse.json({ success: true, analysis });
      }

      // ── Toplu Analiz ──
      case 'bulk_analyze': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const validatedData = bulkAnalyzeSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
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
          return NextResponse.json({ success: true, analyzed: 0 });
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
                emotions: analysis.emotions.map(e => e.label),
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

        return NextResponse.json({ success: true, analyzed: updatedCount, total: feedbackIds.length });
      }

      // ── Tema Kümeleme ──
      case 'theme_clusters': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const validatedData = themeClusterSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
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
          });
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

        return NextResponse.json({ success: true, clusters });
      }

      // ── AI İçgörü Raporu ──
      case 'insights': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const validatedData = insightsSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
        }

        const { qrCodeId, startDate, endDate, period, type } = validatedData.data;

        const where: Record<string, unknown> = {};
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
        }
        if (qrCodeId) where.qrCodeId = qrCodeId;
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
          if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
        }

        const feedbacks = await prisma.feedback.findMany({
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
          take: 200,
        });

        if (feedbacks.length < 3) {
          return NextResponse.json({
            success: true,
            insights: null,
            message: 'Yeterli geri bildirim verisi yok (en az 3 gerekli).',
          });
        }

        // Calculate stats
        const totalCount = feedbacks.length;
        const avgRating = feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalCount;

        const sentimentCounts = feedbacks.reduce(
          (acc, f) => {
            if (f.sentiment) acc[f.sentiment as keyof typeof acc]++;
            return acc;
          },
          { positive: 0, negative: 0, neutral: 0 }
        );

        const sentimentDist = {
          positive: Math.round((sentimentCounts.positive / totalCount) * 100),
          negative: Math.round((sentimentCounts.negative / totalCount) * 100),
          neutral: Math.round((sentimentCounts.neutral / totalCount) * 100),
        };

        // Top topics
        const topicCounts: Record<string, number> = {};
        feedbacks.forEach(f => {
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
          feedbacks.filter(f => f.text).map(f => ({
            text: f.text!,
            sentiment: f.sentiment || undefined,
            rating: f.rating,
            themes: f.themes as unknown as AITheme[] | undefined,
          })),
          period || new Date().toISOString().slice(0, 7)
        );

        // Recent feedbacks
        const recentFeedbacks = feedbacks
          .filter(f => f.text)
          .slice(0, 20)
          .map(f => ({
            text: f.text!,
            rating: f.rating,
            sentiment: f.sentiment || 'neutral',
            intent: f.intent || undefined,
            urgency: f.urgency || undefined,
            churnRisk: f.churnRisk || undefined,
          }));

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

        // Generate comprehensive report
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
            topTopics,
          },
          themeClusters,
        });
      }

      // ── Ask AI (Doğal Dil Sorgulama) ──
      case 'ask': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const validatedData = askAISchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
        }

        const { question, conversationId } = validatedData.data;

        // Get dealer's feedback data for context
        const where: Record<string, unknown> = {};
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
        }

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
        const total = sentimentResults.reduce((acc, s) => acc + s._count, 0);
        const sentimentDist2 = {
          positive: Math.round(((sentimentResults.find(s => s.sentiment === 'positive')?._count || 0) / Math.max(total, 1)) * 100),
          negative: Math.round(((sentimentResults.find(s => s.sentiment === 'negative')?._count || 0) / Math.max(total, 1)) * 100),
          neutral: Math.round(((sentimentResults.find(s => s.sentiment === 'neutral')?._count || 0) / Math.max(total, 1)) * 100),
        };

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

        // Previous messages from conversation
        let previousMessages: { role: 'user' | 'assistant'; content: string }[] = [];
        if (conversationId) {
          try {
            const conv = await prisma.aIConversation.findUnique({
              where: { id: conversationId },
              select: { messages: true },
            });
            if (conv?.messages) {
              previousMessages = (conv.messages as { role: 'user' | 'assistant'; content: string }[]).slice(-8);
            }
          } catch {
            // ignore
          }
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
          previousMessages,
        });

        // Save conversation
        const dealerId = session.user.id;
        let savedConversationId = conversationId;
        try {
          if (conversationId) {
            const existing = await prisma.aIConversation.findUnique({
              where: { id: conversationId },
              select: { messages: true },
            });
            const msgs = (existing?.messages as { role: string; content: string; timestamp: string }[]) || [];
            msgs.push(
              { role: 'user', content: question, timestamp: new Date().toISOString() },
              { role: 'assistant', content: answer || '', timestamp: new Date().toISOString() }
            );
            await prisma.aIConversation.update({
              where: { id: conversationId },
              data: { messages: msgs, updatedAt: new Date() },
            });
          } else {
            const conv = await prisma.aIConversation.create({
              data: {
                dealerId,
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
        });
      }

      // ── AI Chat (Legacy) ──
      case 'chat': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const validatedData = chatSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
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

        return NextResponse.json({ success: true, response });
      }

      // ── AI Settings ──
      case 'get_settings': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const settings = await prisma.aISettings.findUnique({
          where: { dealerId: session.user.id },
        });

        return NextResponse.json({
          success: true,
          settings: settings || getDefaultAISettings(),
        });
      }

      case 'update_settings': {
        if (session.user.role === 'CUSTOMER') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const settingsData = body;
        const updated = await prisma.aISettings.upsert({
          where: { dealerId: session.user.id },
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
            dealerId: session.user.id,
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

        return NextResponse.json({ success: true, settings: updated });
      }

      // ── AI Usage Stats ──
      case 'usage_stats': {
        if (session.user.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
        });
      }

      default:
        return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in AI endpoint:', error);
    return NextResponse.json(
      { error: 'AI analizi sırasında bir hata oluştu' },
      { status: 500 }
    );
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