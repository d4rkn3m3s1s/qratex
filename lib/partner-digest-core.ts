import { prisma } from '@/lib/prisma';

export type PartnerDigestDealerRow = {
  dealerId: string;
  label: string;
  feedbackCount24h: number;
  npsAvg24h: number | null;
  npsResponses24h: number;
  avgRating24h: number | null;
};

export type PartnerDigestPayload = {
  generatedAt: string;
  windowHours: number;
  dealers: PartnerDigestDealerRow[];
};

/**
 * Son 24 saat NPS / geri bildirim özeti — GET digest ve webhook için ortak.
 */
export async function buildPartnerDigestPayload(dealerIdFilter: string | null): Promise<PartnerDigestPayload> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const feedbacks = await prisma.feedback.findMany({
    where: {
      createdAt: { gte: since },
      ...(dealerIdFilter ? { qrCode: { dealerId: dealerIdFilter } } : {}),
    },
    select: { npsScore: true, rating: true, qrCode: { select: { dealerId: true } } },
    take: 8000,
  });

  const byDealer = new Map<
    string,
    { npsSum: number; npsN: number; ratingSum: number; ratingN: number; count: number }
  >();

  for (const f of feedbacks) {
    const did = f.qrCode.dealerId;
    const cur = byDealer.get(did) || { npsSum: 0, npsN: 0, ratingSum: 0, ratingN: 0, count: 0 };
    cur.count += 1;
    if (f.npsScore != null) {
      cur.npsSum += f.npsScore;
      cur.npsN += 1;
    }
    cur.ratingSum += f.rating;
    cur.ratingN += 1;
    byDealer.set(did, cur);
  }

  const dealerIds = [...byDealer.keys()];
  const dealers = await prisma.user.findMany({
    where: { id: { in: dealerIds } },
    select: { id: true, businessName: true, name: true },
  });
  const dmap = new Map(dealers.map((d) => [d.id, d]));

  const dealersOut: PartnerDigestDealerRow[] = dealerIds.map((id) => {
    const s = byDealer.get(id)!;
    const meta = dmap.get(id);
    return {
      dealerId: id,
      label: meta?.businessName || meta?.name || id,
      feedbackCount24h: s.count,
      npsAvg24h: s.npsN ? Math.round((s.npsSum / s.npsN) * 10) / 10 : null,
      npsResponses24h: s.npsN,
      avgRating24h: s.ratingN ? Math.round((s.ratingSum / s.ratingN) * 10) / 10 : null,
    };
  });

  dealersOut.sort((a, b) => b.feedbackCount24h - a.feedbackCount24h);

  return {
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    dealers: dealersOut,
  };
}
