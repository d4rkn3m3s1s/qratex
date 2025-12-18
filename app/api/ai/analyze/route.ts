import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { analyzeWithFallback, generateInsights, chatWithAI } from '@/lib/openai';
import { z } from 'zod';

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute
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

const analyzeSchema = z.object({
  text: z.string().min(5, 'Metin en az 5 karakter olmalı').max(5000),
  feedbackId: z.string().optional(),
});

const insightsSchema = z.object({
  qrCodeId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
});

// ─────────────────────────────────────────────────────────────
// POST /api/ai/analyze - Analyze text with AI
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check rate limit
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
      case 'analyze': {
        const validatedData = analyzeSchema.safeParse(body);
        if (!validatedData.success) {
          return NextResponse.json(
            { error: validatedData.error.errors[0].message },
            { status: 400 }
          );
        }

        const { text, feedbackId } = validatedData.data;

        // Analyze with AI
        const analysis = await analyzeWithFallback(text);

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
            },
          });
        }

        // Log analytics
        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'ai_analysis_used',
            category: 'ai',
            data: { textLength: text.length, feedbackId },
          },
        });

        return NextResponse.json({ success: true, analysis });
      }

      case 'insights': {
        // Only dealers and admins can get insights
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

        const { qrCodeId, startDate, endDate } = validatedData.data;

        // Build filter
        const where: Record<string, unknown> = {};
        
        if (session.user.role === 'DEALER') {
          where.qrCode = { dealerId: session.user.id };
        }
        
        if (qrCodeId) {
          where.qrCodeId = qrCodeId;
        }
        
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
          if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
        }

        // Get feedback stats
        const feedbacks = await prisma.feedback.findMany({
          where,
          select: {
            rating: true,
            sentiment: true,
            topics: true,
            text: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        if (feedbacks.length < 3) {
          return NextResponse.json({
            success: true,
            insights: 'Yeterli geri bildirim verisi yok. En az 3 geri bildirim gerekli.',
          });
        }

        // Calculate stats
        const totalCount = feedbacks.length;
        const averageRating = feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalCount;
        
        const sentimentCounts = feedbacks.reduce(
          (acc, f) => {
            if (f.sentiment) {
              acc[f.sentiment as keyof typeof acc]++;
            }
            return acc;
          },
          { positive: 0, negative: 0, neutral: 0 }
        );

        const sentimentDistribution = {
          positive: Math.round((sentimentCounts.positive / totalCount) * 100),
          negative: Math.round((sentimentCounts.negative / totalCount) * 100),
          neutral: Math.round((sentimentCounts.neutral / totalCount) * 100),
        };

        // Get top topics
        const topicCounts: Record<string, number> = {};
        feedbacks.forEach((f) => {
          const topics = f.topics as string[] | null;
          topics?.forEach((topic) => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          });
        });

        const topTopics = Object.entries(topicCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([topic]) => topic);

        // Get recent feedbacks with text
        const recentFeedbacks = feedbacks
          .filter((f) => f.text)
          .slice(0, 10)
          .map((f) => ({
            text: f.text!,
            rating: f.rating,
            sentiment: f.sentiment || 'neutral',
          }));

        // Generate AI insights
        const insights = await generateInsights({
          totalCount,
          averageRating,
          sentimentDistribution,
          topTopics,
          recentFeedbacks,
        });

        return NextResponse.json({
          success: true,
          insights,
          stats: {
            totalCount,
            averageRating,
            sentimentDistribution,
            topTopics,
          },
        });
      }

      case 'chat': {
        // Only dealers and admins can use chat
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

        // Get user context
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { businessName: true, role: true },
        });

        const context = user?.businessName
          ? `İşletme: ${user.businessName}`
          : undefined;

        const response = await chatWithAI(message, context);

        // Log usage
        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'ai_chat_used',
            category: 'ai',
            data: { messageLength: message.length },
          },
        });

        return NextResponse.json({
          success: true,
          response,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Geçersiz action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in AI endpoint:', error);
    return NextResponse.json(
      { error: 'AI analizi sırasında bir hata oluştu' },
      { status: 500 }
    );
  }
}

