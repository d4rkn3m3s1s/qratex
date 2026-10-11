/**
 * Playbook kütüphanesi + bağlamlı uygulama (eski /admin/playbooks buraya birleşti).
 *
 * Denetim (admin_playbooks.md) kapanışları:
 *  - Bulgu 1: global "taslak" görev üretimi KALDIRILDI (canlı açılıyor, tamamlanamıyordu).
 *  - Bulgu 2: müşteriye giden metin playbook'un `customerTitle/customerMessage` alanından gelir.
 *  - Bulgu 3: hedef kitle `playbook.segment` → kampanya merkezinin segment çözücüsüyle ön sayım.
 *  - Bulgu 4: tek `playbook.apply` denetim kaydı + kampanya modül kapısı.
 *  - Bulgu 5: aynı bayide aynı playbook'un açık taslağı varsa 409 (+ transaction).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { GROWTH_PLAYBOOKS, buildPlaybookDrafts, getPlaybookById, type GrowthPlaybook } from '@/lib/growth-playbooks';
import { campaignsAvailable } from '@/components/dealer/b-kampanyalar/server/common';
import { audienceOverview } from '@/components/dealer/b-kampanyalar/server/audience';
import { DEFAULT_WINDOW, type HealthBand } from '../domain';
import { loadAllRows } from './list';

const OPEN_DRAFT_STATUSES = ['draft', 'failed', 'scheduled'];

export interface PlaybookLibraryItem {
  id: string;
  title: string;
  summary: string;
  category: GrowthPlaybook['category'];
  segment: GrowthPlaybook['segment'];
  triggers: string[];
  dealerActions: string[];
  customerIdeas: string[];
  metricsToWatch: string[];
  customerTitle: string;
  customerMessage: string;
  stats: { applied: number; openDrafts: number; sent: number; recipients: number; dealers: number };
  /** Güncel sinyallere göre bu playbook'un önerildiği bayiler (en düşük skor önce, ilk 5). */
  matching: { count: number; top: Array<{ dealerId: string; label: string; score: number; band: HealthBand }> };
}

export interface PlaybookLibrary {
  computedAt: string;
  items: PlaybookLibraryItem[];
  totals: { applied: number; sent: number; matchingDealers: number };
}

export async function getPlaybookLibrary(): Promise<PlaybookLibrary> {
  const ids = GROWTH_PLAYBOOKS.map((p) => p.id);
  const [{ rows, computedAt }, grouped, dealerPairs] = await Promise.all([
    loadAllRows(DEFAULT_WINDOW),
    prisma.campaign.groupBy({
      by: ['playbookSourceId', 'status'],
      where: { playbookSourceId: { in: ids } },
      _count: { _all: true },
      _sum: { sentCount: true },
    }),
    prisma.campaign.groupBy({ by: ['playbookSourceId', 'dealerId'], where: { playbookSourceId: { in: ids } } }),
  ]);

  const stats = new Map(ids.map((id) => [id, { applied: 0, openDrafts: 0, sent: 0, recipients: 0, dealers: 0 }]));
  for (const g of grouped) {
    const e = g.playbookSourceId ? stats.get(g.playbookSourceId) : undefined;
    if (!e) continue;
    e.applied += g._count._all;
    if (OPEN_DRAFT_STATUSES.includes(g.status)) e.openDrafts += g._count._all;
    if (g.status === 'sent') {
      e.sent += g._count._all;
      e.recipients += g._sum.sentCount ?? 0;
    }
  }
  for (const p of dealerPairs) {
    const e = p.playbookSourceId ? stats.get(p.playbookSourceId) : undefined;
    if (e) e.dealers += 1;
  }

  const sortedRows = [...rows].sort((a, b) => a.score - b.score);
  const matchingDealers = new Set<string>();
  const items: PlaybookLibraryItem[] = GROWTH_PLAYBOOKS.map((pb) => {
    const matches = sortedRows.filter((r) => r.recommendations.some((x) => x.kind === 'playbook' && x.id === pb.id));
    matches.forEach((m) => matchingDealers.add(m.dealerId));
    return {
      id: pb.id,
      title: pb.title,
      summary: pb.summary,
      category: pb.category,
      segment: pb.segment,
      triggers: pb.triggers,
      dealerActions: pb.dealerActions,
      customerIdeas: pb.customerIdeas,
      metricsToWatch: pb.metricsToWatch,
      customerTitle: pb.customerTitle,
      customerMessage: pb.customerMessage,
      stats: stats.get(pb.id)!,
      matching: {
        count: matches.length,
        top: matches.slice(0, 5).map((m) => ({ dealerId: m.dealerId, label: m.label, score: m.score, band: m.band })),
      },
    };
  });

  const totals = items.reduce(
    (acc, i) => ({ applied: acc.applied + i.stats.applied, sent: acc.sent + i.stats.sent, matchingDealers: acc.matchingDealers }),
    { applied: 0, sent: 0, matchingDealers: matchingDealers.size }
  );
  return { computedAt, items, totals };
}

export interface ApplyPreview {
  playbook: { id: string; title: string; segment: GrowthPlaybook['segment'] };
  dealer: { id: string; label: string };
  campaign: { title: string; message: string; segment: GrowthPlaybook['segment'] };
  campaignsEnabled: boolean;
  /** Hedef kitle büyüklüğü (kampanya merkezinin segment çözücüsü); kampanyalar kapalıysa null. */
  audience: { total: number; reachable: number } | null;
  existingDraft: { id: string; title: string; status: string; createdAt: string } | null;
}

async function loadContext(playbookId: string, dealerId: string) {
  const pb = getPlaybookById(playbookId);
  if (!pb) throw new ApiError('NOT_FOUND', 'Playbook bulunamadı.');
  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { id: true, businessName: true, name: true, email: true },
  });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');
  const label = dealer.businessName?.trim() || dealer.name?.trim() || dealer.email || dealer.id.slice(0, 8);
  return { pb, dealer, label };
}

export async function previewApply(playbookId: string, dealerId: string): Promise<ApplyPreview> {
  const { pb, dealer, label } = await loadContext(playbookId, dealerId);
  const drafts = buildPlaybookDrafts(pb, { dealerLabel: dealer.businessName || undefined });
  const [enabled, existing] = await Promise.all([
    campaignsAvailable(dealer.id),
    prisma.campaign.findFirst({
      where: { dealerId: dealer.id, playbookSourceId: pb.id, status: { in: OPEN_DRAFT_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true, createdAt: true },
    }),
  ]);
  let audience: ApplyPreview['audience'] = null;
  if (enabled) {
    const overview = await audienceOverview(dealer.id);
    const seg = overview.segments.find((s) => s.key === pb.segment);
    audience = { total: seg?.total ?? 0, reachable: seg?.reachable ?? 0 };
  }
  return {
    playbook: { id: pb.id, title: pb.title, segment: pb.segment },
    dealer: { id: dealer.id, label },
    campaign: { title: drafts.campaign.title, message: drafts.campaign.message, segment: drafts.campaign.targetSegment },
    campaignsEnabled: enabled,
    audience,
    existingDraft: existing ? { ...existing, createdAt: existing.createdAt.toISOString() } : null,
  };
}

export interface ApplyActor {
  id: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function applyPlaybook(playbookId: string, dealerId: string, actor: ApplyActor): Promise<{ campaignId: string; title: string }> {
  const { pb, dealer, label } = await loadContext(playbookId, dealerId);
  if (!(await campaignsAvailable(dealer.id))) {
    throw new ApiError('MODULE_DISABLED', 'Bu bayide kampanyalar kapalı; taslak oluşturulamaz.');
  }
  const drafts = buildPlaybookDrafts(pb, { dealerLabel: dealer.businessName || undefined });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.campaign.findFirst({
      where: { dealerId: dealer.id, playbookSourceId: pb.id, status: { in: OPEN_DRAFT_STATUSES } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError('CONFLICT', 'Bu bayide aynı playbook için açık bir taslak zaten var.', {
        details: { campaignId: existing.id },
      });
    }
    const campaign = await tx.campaign.create({
      data: {
        dealerId: dealer.id,
        title: drafts.campaign.title,
        message: drafts.campaign.message,
        targetSegment: drafts.campaign.targetSegment,
        channel: drafts.campaign.channel,
        status: 'draft',
        playbookSourceId: pb.id,
      },
      select: { id: true, title: true },
    });
    await tx.notification.create({
      data: {
        userId: dealer.id,
        type: 'info',
        title: 'Yeni kampanya taslağı hazır',
        message: `İşletmeniz için “${campaign.title}” taslağı hazırlandı. Göndermeden önce gözden geçirip kendi dilinize uyarlayın.`,
        data: { kind: 'playbook_draft', campaignId: campaign.id, playbookId: pb.id, href: '/dealer/campaigns' } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        actorType: 'user',
        actorSnapshot: { role: actor.role } as Prisma.InputJsonValue,
        action: 'playbook.apply',
        entity: 'Campaign',
        entityId: campaign.id,
        newData: { playbookId: pb.id, dealerId: dealer.id, dealerLabel: label, segment: pb.segment } as Prisma.InputJsonValue,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
    });
    return { campaignId: campaign.id, title: campaign.title };
  });
}
