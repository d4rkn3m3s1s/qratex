import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { askAI } from '@/lib/ai-engine';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const userId = session.user.id;

    // Müşteri feedbacklarını al
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
        createdAt: true,
        qrCode: {
          select: {
            name: true,
            dealer: { select: { businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (feedbacks.length < 2) {
      return NextResponse.json(
        {
          success: true,
          recommendations: null,
          message: 'Kişiselleştirilmiş öneriler için en az 2 geri bildirim gerekli.',
          stats: { totalFeedbacks: feedbacks.length },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // İstatistikleri hesapla
    const totalFeedbacks = feedbacks.length;
    const avgRating = feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalFeedbacks;

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
      positive: Math.round((sentimentCounts.positive / totalFeedbacks) * 100),
      negative: Math.round((sentimentCounts.negative / totalFeedbacks) * 100),
      neutral: Math.round((sentimentCounts.neutral / totalFeedbacks) * 100),
    };

    // Trend hesaplama (son 10 vs önceki 10)
    const recent = feedbacks.slice(0, Math.min(10, totalFeedbacks));
    const older = feedbacks.slice(Math.min(10, totalFeedbacks), Math.min(20, totalFeedbacks));
    const recentAvg = recent.length > 0 ? recent.reduce((a, f) => a + f.rating, 0) / recent.length : 0;
    const olderAvg = older.length > 0 ? older.reduce((a, f) => a + f.rating, 0) / older.length : recentAvg;
    const ratingTrend = recentAvg - olderAvg;

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

    // Ortalama experience signals
    const urgencyValues = feedbacks.filter(f => f.urgency !== null).map(f => f.urgency!);
    const effortValues = feedbacks.filter(f => f.effortScore !== null).map(f => f.effortScore!);
    const churnValues = feedbacks.filter(f => f.churnRisk !== null).map(f => f.churnRisk!);

    const avgUrgency = urgencyValues.length > 0 ? urgencyValues.reduce((a, b) => a + b, 0) / urgencyValues.length : 0;
    const avgEffort = effortValues.length > 0 ? effortValues.reduce((a, b) => a + b, 0) / effortValues.length : 0;
    const avgChurnRisk = churnValues.length > 0 ? churnValues.reduce((a, b) => a + b, 0) / churnValues.length : 0;

    // En sık gidilen işletmeler
    const businessCounts: Record<string, number> = {};
    feedbacks.forEach(f => {
      const bname = f.qrCode?.dealer?.businessName || f.qrCode?.name || 'Bilinmeyen';
      businessCounts[bname] = (businessCounts[bname] || 0) + 1;
    });
    const topBusinesses = Object.entries(businessCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // AI'dan kişiselleştirilmiş öneriler al
    const recommendationQuestion = `Bu müşterinin geri bildirim geçmişine dayalı kişiselleştirilmiş öneriler oluştur:

Müşteri Profili:
- Toplam ${totalFeedbacks} geri bildirim
- Ortalama puan: ${avgRating.toFixed(1)}/5
- Duygu: %${sentimentDist.positive} olumlu, %${sentimentDist.negative} olumsuz
- Rating trendi: ${ratingTrend > 0 ? 'Yükseliyor' : ratingTrend < 0 ? 'Düşüyor' : 'Stabil'}
- Ort. aciliyet: ${(avgUrgency * 10).toFixed(1)}/10
- Ort. efor: ${(avgEffort * 10).toFixed(1)}/10
- En çok bahsettiği konular: ${topTopics.map(t => t.topic).join(', ')}
- En çok gittiği işletmeler: ${topBusinesses.map(b => b.name).join(', ')}

5 maddelik kişisel AI önerisi oluştur. Her öneri kısa, actionable ve Türkçe olsun. Müşteriye doğrudan hitap et.`;

    const aiRecommendations = await askAI(recommendationQuestion, {
      totalFeedbacks,
      avgRating,
      sentimentDist,
      topTopics,
      recentFeedbacks: feedbacks.slice(0, 10).map(f => ({
        text: f.text!,
        rating: f.rating,
        sentiment: f.sentiment || 'neutral',
        createdAt: f.createdAt.toISOString(),
      })),
    });

    return NextResponse.json(
      {
        success: true,
        recommendations: aiRecommendations,
        stats: {
          totalFeedbacks,
          avgRating,
          sentimentDist,
          ratingTrend: ratingTrend > 0.1 ? 'up' : ratingTrend < -0.1 ? 'down' : 'stable',
          ratingTrendValue: Number(ratingTrend.toFixed(2)),
          avgUrgency,
          avgEffort,
          avgChurnRisk,
          topTopics,
          topBusinesses,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Customer AI recommendations error:', error);
    return NextResponse.json(
      { error: 'AI önerileri oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
