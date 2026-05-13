import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';


export const dynamic = 'force-dynamic';

const DEFAULT_OPTIONS = [
  { type: 'discount', label: 'İndirim', unit: '%', values: [10, 15, 20] },
  { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100, 150] },
];

function parseAutomation(raw: unknown) {
  const base = {
    enabled: false,
    minRating: 2,
    maxPerRun: 5,
    maxMonthlyAuto: 40,
    messageTemplate:
      'Deneyiminiz için özür dileriz. Aşağıdan telafi türü ve miktarınızı seçin (otomatik teklif).',
  };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
    if (typeof o.minRating === 'number') base.minRating = o.minRating;
    if (typeof o.maxPerRun === 'number') base.maxPerRun = o.maxPerRun;
    if (typeof o.maxMonthlyAuto === 'number') base.maxMonthlyAuto = o.maxMonthlyAuto;
    if (typeof o.messageTemplate === 'string') base.messageTemplate = o.messageTemplate;
  }
  return base;
}

/**
 * Düşük puanlı geri bildirimler için telafi taslağını onay kuyruğuna ekler (manuel tetik).
 */
export async function POST() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { dealerRemedyAutomation: true },
  });
  const cfg = parseAutomation(user?.dealerRemedyAutomation);
  if (!cfg.enabled) {
    return NextResponse.json({ error: 'Otomasyon kapalı. Ayarlardan açın.' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthCount = await prisma.remedyOffer.count({
    where: {
      dealerId,
      createdAt: { gte: monthStart },
      status: { in: ['awaiting_dealer_approval', 'pending', 'accepted'] },
    },
  });
  if (monthCount >= cfg.maxMonthlyAuto) {
    const endOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const retryAfterSec = Math.max(3600, Math.ceil((endOfMonth.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Aylık otomatik telafi limiti (${cfg.maxMonthlyAuto}) dolu.` },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          'Retry-After': String(retryAfterSec),
        },
      }
    );
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: since },
      rating: { lte: cfg.minRating },
      userId: { not: null },
      qrCode: { dealerId },
    },
    orderBy: { createdAt: 'desc' },
    take: cfg.maxPerRun + 15,
    select: { id: true, userId: true },
  });

  const createdIds: string[] = [];
  let skipped = 0;

  for (const fb of candidates) {
    if (createdIds.length >= cfg.maxPerRun) break;
    if (monthCount + createdIds.length >= cfg.maxMonthlyAuto) break;

    if (!fb.userId) {
      skipped++;
      continue;
    }

    const existing = await prisma.remedyOffer.findFirst({
      where: {
        feedbackId: fb.id,
        status: { in: ['pending', 'awaiting_dealer_approval', 'accepted'] },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const offer = await prisma.remedyOffer.create({
      data: {
        feedbackId: fb.id,
        dealerId,
        userId: fb.userId,
        message: cfg.messageTemplate,
        status: 'awaiting_dealer_approval',
        options: DEFAULT_OPTIONS as object,
      },
    });
    createdIds.push(offer.id);

    await appendRemedyTimelineEvent(prisma, offer.id, 'created', 'Otomasyon ile telafi taslağı oluşturuldu', {
      preview: cfg.messageTemplate.slice(0, 120),
    });
    await appendRemedyTimelineEvent(prisma, offer.id, 'queued', 'Onay kuyruğunda');

    await prisma.analyticsEvent.create({
      data: {
        userId: dealerId,
        event: 'remedy_automation_queued',
        category: 'dealer',
        data: { feedbackId: fb.id, offerId: offer.id },
      },
    });
  }

  return NextResponse.json({
    success: true,
    queued: createdIds.length,
    offerIds: createdIds,
    skipped,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
