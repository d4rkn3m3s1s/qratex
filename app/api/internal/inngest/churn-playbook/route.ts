import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantHealth } from '@/lib/tenant-health';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CHURN_HEALTH_THRESHOLD = parsePositiveIntEnv(process.env.CHURN_HEALTH_THRESHOLD, 50);

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const healthList = await getTenantHealth();
  const atRisk = healthList.filter((h) => h.healthScore < CHURN_HEALTH_THRESHOLD);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let created = 0;
  for (const h of atRisk) {
    const existing = await prisma.cSMTask.findFirst({
      where: { dealerId: h.dealerId, type: 'churn_risk', createdAt: { gte: weekAgo } },
    });
    if (existing) continue;
    const suggestedActions = [
      { action: 'Geribildirim trendlerini inceleyin', priority: 'high' },
      { action: 'Negatif yanıtları tamamlayın', priority: 'high' },
      { action: 'Müşteri ile iletişime geçin', priority: 'medium' },
    ];
    const telafiDraft =
      'Değerli müşterimiz, yaşadığınız deneyimden dolayı üzgünüz. Sizi tekrar ağırlamak istiyoruz. Size özel bir teklif hazırladık.';
    await prisma.cSMTask.create({
      data: {
        dealerId: h.dealerId,
        type: 'churn_risk',
        status: 'open',
        priority: h.healthScore < 30 ? 'high' : 'medium',
        healthScore: h.healthScore,
        suggestedActions,
        telafiDraft,
        metadata: { negativeRate: h.negativeRate, usageTrend: h.usageTrend },
      },
    });
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: '⚠️ Churn Riski',
          message: `${h.dealerName || h.dealerId} işletmesi risk altında (skor: ${h.healthScore}). CSM görevi oluşturuldu.`,
          type: 'warning',
        },
      });
    }
    created++;
  }
  return NextResponse.json({ atRiskCount: atRisk.length, tasksCreated: created });
}
