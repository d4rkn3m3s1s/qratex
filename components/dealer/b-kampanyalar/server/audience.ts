/**
 * Kampanya kitlesi — TEK kaynak (denetim Bulgu 3: üç farklı "segment" tanımı çelişiyordu).
 *
 * Evren: bu işletmede tüketimi OLAN ya da (silinmemiş) geri bildirim bırakmış müşteriler.
 * Segment: `lib/dealer-customer-stats` bayi-yerel kuralı (segment merkeziyle aynı: Risk > VIP >
 * Sadık > Uyuyan > Yeni). Platform geneli VIP/CLV OKUNMAZ (eskiden "VIP" başka işletmelerdeki
 * puanla belirleniyordu). Yalnız geri bildirim bırakmış müşteriler için aynı kural, tüketimsiz
 * (harcama 0, ziyaret 0) ve geri bildirim tarihleriyle uygulanır.
 *
 * İzin: pazarlama kapısı `resolveMarketingAudience` (kanal bazlı tercih, fail-closed).
 * Frekans: son 7 günde bu işletmeden ≥ 2 pazarlama iletisi almış müşteri bu gönderimde atlanır.
 */
import { prisma } from '@/lib/prisma';
import { computeDealerCustomerStats, pickDealerSegment, type DealerSegmentKey } from '@/lib/dealer-customer-stats';
import { resolveMarketingAudience, type MarketingAudience } from '@/lib/marketing-delivery';
import {
  ACTIVE_WINDOW_DAYS,
  CAMPAIGN_SEGMENT_KEYS,
  DEALER_SEGMENT_TO_CAMPAIGN,
  FREQUENCY_CAP,
  planCampaignDelivery,
  type CampaignSegmentKey,
  type DeliveryPlan,
} from '../domain';
import type { AudienceOverview, SendPreview } from '../types';
import { chunk } from './common';
import { readSendSnapshots } from './snapshot';

const DAY_MS = 86_400_000;
const ID_CHUNK = 5000;

export interface UniverseMember {
  id: string;
  /** Bayi-yerel segment (kampanya anahtarıyla); segmentsiz müşteri → null. */
  segment: Exclude<CampaignSegmentKey, 'all' | 'active'> | null;
  /** Bu işletmedeki son etkinlik (tüketim ya da geri bildirim), ms. */
  lastActivityAt: number;
}

function mapSegment(key: DealerSegmentKey | null): UniverseMember['segment'] {
  return key ? DEALER_SEGMENT_TO_CAMPAIGN[key] : null;
}

/** Bayinin kampanya evreni — son etkinliğe göre yeniden eskiye sıralı. */
export async function loadAudienceUniverse(dealerId: string, now: Date = new Date()): Promise<UniverseMember[]> {
  const [stats, feedbackUsers] = await Promise.all([
    computeDealerCustomerStats(dealerId, { now }),
    prisma.feedback.groupBy({
      by: ['userId'],
      where: { qrCode: { dealerId }, deletedAt: null, userId: { not: null } },
      _min: { createdAt: true },
      _max: { createdAt: true },
      _avg: { churnRisk: true },
    }),
  ]);

  const byId = new Map<string, UniverseMember>();
  for (const s of stats) {
    byId.set(s.customerId, {
      id: s.customerId,
      segment: mapSegment(s.segmentKey),
      lastActivityAt: s.lastVisitAt?.getTime() ?? 0,
    });
  }
  for (const f of feedbackUsers) {
    if (!f.userId) continue;
    const last = f._max.createdAt?.getTime() ?? 0;
    const existing = byId.get(f.userId);
    if (existing) {
      // Segment segment merkeziyle aynı kalır (tüketim istatistiği); son etkinlik ikisinin en yenisi.
      if (last > existing.lastActivityAt) existing.lastActivityAt = last;
      continue;
    }
    const segment = pickDealerSegment(
      {
        totalSpend: 0,
        visitCount: 0,
        churnRisk: f._avg.churnRisk ?? null,
        firstVisitAt: f._min.createdAt ?? null,
        lastVisitAt: f._max.createdAt ?? null,
      },
      now
    );
    byId.set(f.userId, { id: f.userId, segment: mapSegment(segment), lastActivityAt: last });
  }

  return [...byId.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id));
}

/** Segment üyeleri (evrenin sırası korunur). */
export function segmentMembers(universe: readonly UniverseMember[], key: CampaignSegmentKey, now: Date): UniverseMember[] {
  if (key === 'all') return [...universe];
  if (key === 'active') {
    const since = now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS;
    return universe.filter((m) => m.lastActivityAt >= since);
  }
  return universe.filter((m) => m.segment === key);
}

/** Büyük kitlelerde pazarlama kapısını parça parça çalıştırır (tek `IN` listesi şişmesin). */
export async function resolveAudienceChunked(ids: readonly string[]): Promise<MarketingAudience> {
  const acc: MarketingAudience = {
    candidateCount: 0,
    ineligibleCount: 0,
    optedOutCount: 0,
    reachCount: 0,
    appUserIds: [],
    pushUserIds: [],
  };
  for (const part of chunk(ids, ID_CHUNK)) {
    const a = await resolveMarketingAudience(part);
    acc.candidateCount += a.candidateCount;
    acc.ineligibleCount += a.ineligibleCount;
    acc.optedOutCount += a.optedOutCount;
    acc.reachCount += a.reachCount;
    acc.appUserIds.push(...a.appUserIds);
    acc.pushUserIds.push(...a.pushUserIds);
  }
  return acc;
}

/** Editördeki segment kartları: her segmentin büyüklüğü ve izinli (ulaşılabilir) kısmı. */
export async function audienceOverview(dealerId: string, now: Date = new Date()): Promise<AudienceOverview> {
  const universe = await loadAudienceUniverse(dealerId, now);
  const gate = await resolveAudienceChunked(universe.map((m) => m.id));
  const reachable = new Set([...gate.appUserIds, ...gate.pushUserIds]);
  return {
    segments: CAMPAIGN_SEGMENT_KEYS.map((key) => {
      const members = segmentMembers(universe, key, now);
      return { key, total: members.length, reachable: members.filter((m) => reachable.has(m.id)).length };
    }),
    computedAt: now.toISOString(),
  };
}

/**
 * Son FREQUENCY_CAP.days günde bu işletmeden alınan pazarlama iletisi sayısı (kişi başına).
 * Kaynaklar: (1) kampanya gönderim kayıtları (push-only alıcılar dahil), (2) bu işletmenin
 * `data.dealerId` taşıyan uygulama içi pazarlama bildirimleri (win-back, risk segmenti…).
 * Aynı kampanya iki kaynaktan gelse de bir kez sayılır.
 */
export async function loadRecentMarketingCounts(
  dealerId: string,
  candidateIds: readonly string[],
  now: Date = new Date()
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (candidateIds.length === 0) return counts;
  const since = new Date(now.getTime() - FREQUENCY_CAP.days * DAY_MS);
  const candidates = new Set(candidateIds);
  const seen = new Set<string>();
  const bump = (userId: string, key: string) => {
    const k = `${userId}|${key}`;
    if (seen.has(k)) return;
    seen.add(k);
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  };

  const recent = await prisma.campaign.findMany({
    where: { dealerId, sentAt: { gte: since }, status: { in: ['sent', 'archived'] } },
    select: { id: true },
  });
  const snapshots = await readSendSnapshots(recent.map((c) => c.id));
  for (const [cid, s] of snapshots) {
    for (const uid of s.recipients) if (candidates.has(uid)) bump(uid, `c:${cid}`);
  }

  for (const part of chunk([...candidates], ID_CHUNK)) {
    const rows = await prisma.notification.findMany({
      where: {
        userId: { in: part },
        type: 'campaign',
        createdAt: { gte: since },
        data: { path: ['dealerId'], equals: dealerId },
      },
      select: { id: true, userId: true, data: true },
    });
    for (const r of rows) {
      const d = (r.data ?? {}) as Record<string, unknown>;
      bump(r.userId, typeof d.campaignId === 'string' ? `c:${d.campaignId}` : `n:${r.id}`);
    }
  }
  return counts;
}

export interface SendPlanResult {
  segment: CampaignSegmentKey;
  plan: DeliveryPlan;
}

/** Bir kampanya için kim alacak? (önizleme ve gönderim AYNI hesabı kullanır). */
export async function buildSendPlan(input: {
  dealerId: string;
  campaignId: string;
  segment: CampaignSegmentKey;
  holdoutPct: number;
  now?: Date;
}): Promise<SendPlanResult> {
  const now = input.now ?? new Date();
  const universe = await loadAudienceUniverse(input.dealerId, now);
  const ordered = segmentMembers(universe, input.segment, now).map((m) => m.id);
  const gate = await resolveAudienceChunked(ordered);
  const reachable = new Set([...gate.appUserIds, ...gate.pushUserIds]);
  const recentCounts = await loadRecentMarketingCounts(
    input.dealerId,
    ordered.filter((id) => reachable.has(id)),
    now
  );
  const plan = planCampaignDelivery({
    campaignId: input.campaignId,
    orderedCandidates: ordered,
    appUserIds: gate.appUserIds,
    pushUserIds: gate.pushUserIds,
    recentCounts,
    holdoutPct: input.holdoutPct,
  });
  // Ulaşılamayanların ayrımı (hesap uygun değil / tercih kapalı) kapının sayımından gelir.
  plan.ineligibleCount = gate.ineligibleCount;
  plan.optedOutCount = gate.optedOutCount;
  return { segment: input.segment, plan };
}

export function toSendPreview(segment: CampaignSegmentKey | null, holdoutRequested: number, plan: DeliveryPlan | null): SendPreview {
  return {
    segment,
    candidateCount: plan?.candidateCount ?? 0,
    ineligibleCount: plan?.ineligibleCount ?? 0,
    optedOutCount: plan?.optedOutCount ?? 0,
    frequencyCappedCount: plan?.frequencyCappedCount ?? 0,
    truncatedCount: plan?.truncatedCount ?? 0,
    holdoutRequested,
    holdoutApplied: plan?.holdoutApplied ?? false,
    holdoutCount: plan?.holdoutIds.length ?? 0,
    recipientCount: plan?.recipientIds.length ?? 0,
    inAppCount: plan?.appUserIds.length ?? 0,
    pushCount: plan?.pushUserIds.length ?? 0,
  };
}
