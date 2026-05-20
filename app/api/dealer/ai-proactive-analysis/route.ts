import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { generateInsightReport } from '@/lib/ai-engine';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const dealerId = auth.session.user.id;

    // Son 7 günlük verileri topla
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const feedbacks = await prisma.feedback.findMany({
      where: {
        qrCode: { dealerId },
        createdAt: { gte: sevenDaysAgo }
      },
      select: {
        text: true,
        rating: true,
        sentiment: true,
        intent: true,
        urgency: true,
        churnRisk: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    if (feedbacks.length < 3) {
      return NextResponse.json({ 
        success: true, 
        message: 'Analiz için yeterli geri bildirim yok (en az 3 adet gerekli).' 
      });
    }

    // İstatistikleri hesapla
    const total = feedbacks.length;
    const avgRating = feedbacks.reduce((acc, f) => acc + (f.rating || 0), 0) / total;
    const sentimentDist = {
      positive: Math.round((feedbacks.filter(f => f.sentiment === 'positive').length / total) * 100),
      negative: Math.round((feedbacks.filter(f => f.sentiment === 'negative').length / total) * 100),
      neutral: Math.round((feedbacks.filter(f => f.sentiment === 'neutral').length / total) * 100),
    };

    // Rapor oluştur
    const report = await generateInsightReport({
      dealerId,
      period: 'Son 7 Gün',
      totalFeedbacks: total,
      avgRating,
      sentimentDist,
      topTopics: [], // Opsiyonel
      themeClusters: [], // Opsiyonel
      recentFeedbacks: feedbacks as any[]
    });

    return NextResponse.json({ success: true, report }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Proactive Analysis Error:', error);
    return NextResponse.json({ error: 'Analiz oluşturulamadı' }, { status: 500 });
  }
}
