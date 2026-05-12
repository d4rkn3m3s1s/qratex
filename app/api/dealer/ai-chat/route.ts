import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { askAI } from '@/lib/ai-engine';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const chatSchema = z.object({
    question: z.string().min(1).max(2000),
    conversationId: z.string().optional(),
});

// Rate limiter: 20 req/min for dealers
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(userId: string): boolean {
    const now = Date.now();
    const e = rateMap.get(userId);
    if (!e || now > e.resetAt) { rateMap.set(userId, { count: 1, resetAt: now + 60000 }); return true; }
    if (e.count >= 20) return false;
    e.count++;
    return true;
}

// GET — list dealer's conversations
export async function GET() {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;

        const conversations = await prisma.aIConversation.findMany({
            where: { dealerId: auth.session.user.id },
            select: { id: true, title: true, createdAt: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });

        return NextResponse.json({ success: true, conversations });
    } catch (error) {
        console.error('AI chat list error:', error);
        return NextResponse.json({ error: 'Sohbetler yüklenemedi' }, { status: 500 });
    }
}

// POST — send message
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;
        const userId = auth.session.user.id;

        if (!checkRate(userId)) {
            return NextResponse.json({ error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' }, { status: 429 });
        }

        const body = await request.json();
        const parsed = chatSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        const { question, conversationId } = parsed.data;

        // Gather dealer context
        const [feedbacks, stats] = await Promise.all([
            prisma.feedback.findMany({
                where: { qrCode: { dealerId: userId } },
                select: { text: true, rating: true, sentiment: true, topics: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
            prisma.feedback.aggregate({
                where: { qrCode: { dealerId: userId } },
                _count: true,
                _avg: { rating: true },
            }),
        ]);

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

        const total = feedbacks.length || 1;
        const sentimentDist = {
            positive: Math.round((sentimentCounts.positive / total) * 100),
            negative: Math.round((sentimentCounts.negative / total) * 100),
            neutral: Math.round((sentimentCounts.neutral / total) * 100),
        };

        // Topic extraction
        const topicCounts: Record<string, number> = {};
        feedbacks.forEach((f) => {
            (f.topics as string[] | null)?.forEach((t) => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
        });
        const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count }));

        // Previous messages
        let previousMessages: { role: 'user' | 'assistant'; content: string }[] = [];
        if (conversationId) {
            const conv = await prisma.aIConversation.findUnique({
                where: { id: conversationId, dealerId: userId },
                select: { messages: true },
            });
            if (conv?.messages) {
                previousMessages = (conv.messages as { role: 'user' | 'assistant'; content: string }[]).slice(-12);
            }
        }

        const recentFeedbacks = feedbacks.slice(0, 15).map((f) => ({
            text: f.text || '',
            rating: f.rating,
            sentiment: f.sentiment || 'neutral',
            createdAt: f.createdAt.toISOString(),
        }));

        const answer = await askAI(question, {
            totalFeedbacks: stats._count,
            avgRating: stats._avg.rating ?? 0,
            sentimentDist,
            topTopics,
            recentFeedbacks,
            previousMessages,
        });

        // Save conversation
        let savedId = conversationId;
        const ts = new Date().toISOString();
        if (conversationId) {
            const existing = await prisma.aIConversation.findUnique({
                where: { id: conversationId, dealerId: userId },
                select: { messages: true },
            });
            const msgs = (existing?.messages as object[]) || [];
            msgs.push(
                { role: 'user', content: question, timestamp: ts },
                { role: 'assistant', content: answer || '', timestamp: ts }
            );
            await prisma.aIConversation.update({
                where: { id: conversationId },
                data: { messages: msgs, updatedAt: new Date() },
            });
        } else {
            const conv = await prisma.aIConversation.create({
                data: {
                    dealerId: userId,
                    title: question.slice(0, 100),
                    messages: [
                        { role: 'user', content: question, timestamp: ts },
                        { role: 'assistant', content: answer || '', timestamp: ts },
                    ],
                },
            });
            savedId = conv.id;
        }

        return NextResponse.json({ success: true, answer, conversationId: savedId });
    } catch (error) {
        console.error('Dealer AI chat error:', error);
        return NextResponse.json({ error: 'AI sohbeti başarısız' }, { status: 500 });
    }
}
