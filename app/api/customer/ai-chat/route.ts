import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { askAI } from '@/lib/ai-engine';
import { z } from 'zod';

const chatSchema = z.object({
  question: z.string().min(1).max(1000),
  conversationId: z.string().optional(),
});

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) return false; // 10 per minute for customers
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit(session.user.id)) {
      return NextResponse.json({ error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' }, { status: 429 });
    }

    const body = await request.json();
    const validated = chatSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 });
    }

    const { question, conversationId } = validated.data;
    const userId = session.user.id;

    // Müşterinin kendi feedback verilerini topla
    const feedbacks = await prisma.feedback.findMany({
      where: { userId, text: { not: null } },
      select: {
        text: true,
        rating: true,
        sentiment: true,
        emotions: true,
        topics: true,
        intent: true,
        urgency: true,
        effortScore: true,
        churnRisk: true,
        themes: true,
        createdAt: true,
        qrCode: {
          select: {
            name: true,
            dealer: { select: { businessName: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // İstatistik hesapla
    const totalFeedbacks = feedbacks.length;
    const avgRating = totalFeedbacks > 0
      ? feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks
      : 0;

    // Duygu dağılımı
    const sentimentCounts = feedbacks.reduce(
      (acc, f) => {
        const s = f.sentiment || 'neutral';
        if (s === 'positive') acc.positive++;
        else if (s === 'negative') acc.negative++;
        else acc.neutral++;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
    );
    const sentimentDist = {
      positive: totalFeedbacks > 0 ? Math.round((sentimentCounts.positive / totalFeedbacks) * 100) : 0,
      negative: totalFeedbacks > 0 ? Math.round((sentimentCounts.negative / totalFeedbacks) * 100) : 0,
      neutral: totalFeedbacks > 0 ? Math.round((sentimentCounts.neutral / totalFeedbacks) * 100) : 0,
    };

    // Konular
    const topicCounts: Record<string, number> = {};
    feedbacks.forEach(f => {
      const topics = f.topics as string[] | null;
      topics?.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count }));

    // Önceki konuşma mesajları
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

    // En son feedbacklar (zenginleştirilmiş bağlam)
    const recentFeedbacksForAI = feedbacks.slice(0, 15).map(f => ({
      text: f.text!,
      rating: f.rating,
      sentiment: f.sentiment || 'neutral',
      createdAt: f.createdAt.toISOString(),
    }));

    // AI'a sor
    const answer = await askAI(question, {
      totalFeedbacks,
      avgRating,
      sentimentDist,
      topTopics,
      recentFeedbacks: recentFeedbacksForAI,
      previousMessages,
    });

    // Konuşmayı kaydet
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
            dealerId: userId, // AIConversation dealerId alanı userId olarak kullanılır
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
      console.error('Failed to save customer conversation:', err);
    }

    return NextResponse.json({
      success: true,
      answer,
      conversationId: savedConversationId,
    });
  } catch (error) {
    console.error('Customer AI chat error:', error);
    return NextResponse.json({ error: 'AI sohbeti sırasında bir hata oluştu' }, { status: 500 });
  }
}
