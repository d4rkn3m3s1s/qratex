import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

function slugToken(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
}

/**
 * Kampanya başlığı ile utm_campaign gevşek eşlemesi + son 30 gün geri bildirim özeti.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, dealerId: true, title: true, message: true, status: true, sentAt: true, sentCount: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (session.user.role === 'DEALER' && campaign.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const token = slugToken(campaign.title);
  const utmWhere =
    token.length >= 3
      ? {
          deletedAt: null,
          createdAt: { gte: since },
          qrCode: { dealerId: campaign.dealerId },
          utmCampaign: { contains: token, mode: 'insensitive' as Prisma.QueryMode },
        }
      : null;

  const [matchedFeedbacks, totalFb30d, avgAgg] = await Promise.all([
    utmWhere
      ? prisma.feedback.count({ where: utmWhere })
      : Promise.resolve(0),
    prisma.feedback.count({
      where: { deletedAt: null, createdAt: { gte: since }, qrCode: { dealerId: campaign.dealerId } },
    }),
    utmWhere
      ? prisma.feedback.aggregate({
          where: utmWhere,
          _avg: { rating: true },
        })
      : Promise.resolve({ _avg: { rating: null as number | null } }),
  ]);

  return NextResponse.json({
    success: true,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      sentCount: campaign.sentCount,
    },
    windowDays: 30,
    attribution: {
      matchToken: token || null,
      matchedFeedbackCount: matchedFeedbacks,
      avgRatingOnMatched: avgAgg._avg.rating != null ? Number(avgAgg._avg.rating.toFixed(2)) : null,
      totalFeedbackDealer30d: totalFb30d,
      shareOfVoice:
        totalFb30d > 0 ? Math.round((matchedFeedbacks / totalFb30d) * 1000) / 10 : matchedFeedbacks > 0 ? 100 : 0,
    },
    note:
      'utm_campaign değerleri kampanya başlığıyla kısmen eşleşir; kesin ROI için UTM şablonunu standartlaştırın.',
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
