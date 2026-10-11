/**
 * Segment kampanya önerileri — TEK onay kuyruğu (eski /admin/innovation kopyası kaldırıldı).
 *
 *  - Durum makinesi: PENDING → APPROVED | REJECTED (koşullu `updateMany`; bayat listede 409).
 *    `SENT` yalnız gerçek gönderim ucunun (`/api/dealer/innovation/segment-proposals/[id]/send`)
 *    yazdığı durumdur; yöneticinin "gönderildi işaretle" kısayolu yok (rapor Bulgu 1-2).
 *  - Karar notu (ret için zorunlu) denetim izine (`AuditLog.newData.note`) yazılır ve bayiye
 *    bildirim olarak gider — şemaya yeni alan eklemeden (ŞEMA İSTEĞİ: `decisionNote`).
 *  - Demo (isDemo) bayilerin önerileri işaretlenir ve onaylanamaz.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { ApiError } from '@/lib/http/define-route';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { resolveInnovationSegmentUserIds } from '@/lib/innovation-segment-users';
import { resolveMarketingAudience } from '@/lib/marketing-delivery';
import { segmentCampaignDraft, type SegmentKey } from '@/lib/innovation-segment-templates';
import {
  PROPOSAL_STATUSES,
  SEND_CAP,
  ageHours,
  isInnovationSegmentKey,
  isProposalStatus,
  sameText,
  validateDecisionNote,
  type AdminDecision,
  type BulkDecideResult,
  type DecideResult,
  type ProposalDetail,
  type ProposalListResult,
  type ProposalRow,
  type ProposalStatus,
} from '../domain';

export const PROPOSAL_ENTITY = 'SegmentCampaignProposal';
const DECIDE_ACTIONS = ['segment_proposal.approve', 'segment_proposal.reject'];
const SENT_EVENT = 'innovation_segment_proposal_sent';

export interface ProposalActor {
  id: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type DealerLite = { id: string; businessName: string | null; name: string | null; email: string | null; isDemo: boolean };

function dealerLabel(d: Pick<DealerLite, 'id' | 'businessName' | 'name' | 'email'>): string {
  return d.businessName?.trim() || d.name?.trim() || d.email?.trim() || d.id;
}

function templateUnchanged(segmentKey: string, title: string, message: string): boolean {
  if (!isInnovationSegmentKey(segmentKey)) return false;
  const t = segmentCampaignDraft(segmentKey as SegmentKey);
  return sameText(t.title, title) && sameText(t.message, message);
}

function noteFrom(newData: Prisma.JsonValue | null): string | null {
  if (!newData || typeof newData !== 'object' || Array.isArray(newData)) return null;
  const n = (newData as Record<string, unknown>).note;
  return typeof n === 'string' && n.trim() ? n : null;
}

async function featureEnabled(): Promise<boolean> {
  try {
    return (await getInnovationPlatformConfig()).features.segmentProposals !== false;
  } catch {
    return true;
  }
}

// ───────────────────────────── Liste ─────────────────────────────

export interface ProposalListQuery {
  status: ProposalStatus | 'ALL';
  q?: string | null;
  segment?: string | null;
  source?: 'all' | 'real' | 'demo';
  page: number;
  size: number;
}

function listWhere(q: ProposalListQuery): Prisma.SegmentCampaignProposalWhereInput {
  const and: Prisma.SegmentCampaignProposalWhereInput[] = [];
  if (q.segment) and.push({ segmentKey: q.segment });
  if (q.source === 'demo') and.push({ dealer: { isDemo: true } });
  if (q.source === 'real') and.push({ dealer: { isDemo: false } });
  const term = (q.q ?? '').trim().slice(0, 100);
  if (term) {
    and.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { dealer: { businessName: { contains: term, mode: 'insensitive' } } },
        { dealer: { name: { contains: term, mode: 'insensitive' } } },
        { dealer: { email: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listProposals(q: ProposalListQuery, now: Date = new Date()): Promise<ProposalListResult> {
  const base = listWhere(q);
  const where: Prisma.SegmentCampaignProposalWhereInput =
    q.status === 'ALL' ? base : { AND: [base, { status: q.status }] };
  // Bekleyenler en eskiden (FIFO); diğerleri en yeni karardan.
  const orderBy: Prisma.SegmentCampaignProposalOrderByWithRelationInput[] =
    q.status === 'PENDING'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ decidedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }];

  const [total, rows, grouped, oldest, enabled] = await Promise.all([
    prisma.segmentCampaignProposal.count({ where }),
    prisma.segmentCampaignProposal.findMany({
      where,
      orderBy,
      take: q.size,
      skip: (q.page - 1) * q.size,
      select: {
        id: true,
        title: true,
        message: true,
        segmentKey: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        decidedById: true,
        dealer: { select: { id: true, businessName: true, name: true, email: true, isDemo: true } },
      },
    }),
    prisma.segmentCampaignProposal.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.segmentCampaignProposal.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    featureEnabled(),
  ]);

  const counts = Object.fromEntries(PROPOSAL_STATUSES.map((s) => [s, 0])) as Record<ProposalStatus, number>;
  for (const g of grouped) if (isProposalStatus(g.status)) counts[g.status] = g._count?._all ?? 0;

  const items = await decorateRows(rows, now);
  return {
    items,
    total,
    page: q.page,
    size: q.size,
    counts,
    oldestPendingHours: oldest ? ageHours(oldest.createdAt, now) : null,
    featureEnabled: enabled,
    computedAt: now.toISOString(),
  };
}

type RawRow = {
  id: string;
  title: string;
  message: string;
  segmentKey: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  decidedById: string | null;
  dealer: DealerLite;
};

/** Karar veren adı, karar notu (denetim izinden) ve gerçek gönderim sayısını ekler — sayfa başına 3 toplu sorgu. */
async function decorateRows(rows: RawRow[], now: Date): Promise<ProposalRow[]> {
  const ids = rows.map((r) => r.id);
  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((x): x is string => !!x))];
  const sentIds = rows.filter((r) => r.status === 'SENT').map((r) => r.id);
  const [deciders, audits, sentEvents] = await Promise.all([
    deciderIds.length
      ? prisma.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    ids.length
      ? prisma.auditLog.findMany({
          where: { entity: PROPOSAL_ENTITY, entityId: { in: ids }, action: { in: DECIDE_ACTIONS } },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, newData: true },
        })
      : Promise.resolve([]),
    sentIds.length
      ? prisma.analyticsEvent.findMany({
          where: { event: SENT_EVENT, OR: sentIds.map((id) => ({ data: { path: ['proposalId'], equals: id } })) },
          select: { data: true },
        })
      : Promise.resolve([]),
  ]);
  const deciderMap = new Map(deciders.map((u) => [u.id, u.name?.trim() || u.email || u.id]));
  const noteMap = new Map<string, string | null>();
  for (const a of audits) if (a.entityId && !noteMap.has(a.entityId)) noteMap.set(a.entityId, noteFrom(a.newData));
  const sentMap = new Map<string, number>();
  for (const e of sentEvents) {
    const d = e.data as Record<string, unknown> | null;
    if (d && typeof d.proposalId === 'string' && typeof d.sentCount === 'number') sentMap.set(d.proposalId, d.sentCount);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    segmentKey: r.segmentKey,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    ageHours: ageHours(r.createdAt, now),
    dealer: { id: r.dealer.id, label: dealerLabel(r.dealer), isDemo: r.dealer.isDemo },
    decidedBy: r.decidedById ? { id: r.decidedById, label: deciderMap.get(r.decidedById) ?? r.decidedById } : null,
    decisionNote: noteMap.get(r.id) ?? null,
    sentCount: sentMap.get(r.id) ?? null,
    templateUnchanged: templateUnchanged(r.segmentKey, r.title, r.message),
  }));
}

// ───────────────────────────── Detay ─────────────────────────────

/** Kitle önizlemesi — gönderim ucuyla AYNI hesap (segment çözümü + rıza kapısı). 10 dk önbellek. */
async function audienceFor(dealerId: string, segmentKey: string) {
  return cachedJson(`admin:segments:proposal-audience:v1:${dealerId}:${segmentKey}`, 600, async () => {
    const ids = [...new Set(await resolveInnovationSegmentUserIds(dealerId, segmentKey))];
    const considered = ids.slice(0, SEND_CAP);
    const audience = considered.length ? await resolveMarketingAudience(considered) : null;
    return {
      candidates: ids.length,
      considered: considered.length,
      truncated: ids.length > SEND_CAP,
      reach: audience?.reachCount ?? 0,
      optedOut: audience?.optedOutCount ?? 0,
    };
  });
}

export async function getProposalDetail(id: string, now: Date = new Date()): Promise<ProposalDetail> {
  const row = await prisma.segmentCampaignProposal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      message: true,
      segmentKey: true,
      status: true,
      createdAt: true,
      decidedAt: true,
      decidedById: true,
      dealerId: true,
      dealer: { select: { id: true, businessName: true, name: true, email: true, isDemo: true } },
    },
  });
  if (!row) throw new ApiError('NOT_FOUND', 'Öneri bulunamadı.');
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [decorated] = await decorateRows([row], now);

  const [statusCounts, recent, audits, audienceResult] = await Promise.all([
    prisma.segmentCampaignProposal.groupBy({
      by: ['status'],
      where: { dealerId: row.dealerId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.segmentCampaignProposal.findMany({
      where: { dealerId: row.dealerId, id: { not: row.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entity: PROPOSAL_ENTITY, entityId: row.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, action: true, createdAt: true, newData: true, user: { select: { name: true, email: true } } },
    }),
    audienceFor(row.dealerId, row.segmentKey).then(
      (a) => ({ ok: true as const, a }),
      (err) => {
        console.error('[segments] kitle önizlemesi hesaplanamadı', err);
        return { ok: false as const };
      }
    ),
  ]);

  const byStatus = new Map(statusCounts.map((g) => [g.status, g._count?._all ?? 0]));
  const proposalsLast30d = [...byStatus.values()].reduce((a, b) => a + b, 0);

  return {
    ...decorated,
    audience: audienceResult.ok ? audienceResult.a : null,
    audienceError: !audienceResult.ok,
    dealerStats: {
      sentLast30d: byStatus.get('SENT') ?? 0,
      proposalsLast30d,
      rejectedLast30d: byStatus.get('REJECTED') ?? 0,
    },
    recent: recent.map((r) => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString() })),
    history: audits.map((a) => ({
      id: a.id,
      action: a.action,
      at: a.createdAt.toISOString(),
      actor: a.user?.name?.trim() || a.user?.email || null,
      note: noteFrom(a.newData),
    })),
  };
}

// ───────────────────────────── Karar ─────────────────────────────

export async function decideProposal(
  id: string,
  input: { decision: AdminDecision; note?: string | null },
  actor: ProposalActor,
  now: Date = new Date()
): Promise<DecideResult> {
  const noteCheck = validateDecisionNote(input.decision, input.note);
  if (!noteCheck.ok) {
    throw new ApiError(
      'VALIDATION',
      noteCheck.reason === 'too_long' ? 'Not en fazla 500 karakter olabilir.' : 'Ret için en az 5 karakterlik bir gerekçe yazın; bayiye iletilir.',
      { details: [{ path: 'note', message: noteCheck.reason }] }
    );
  }

  const proposal = await prisma.segmentCampaignProposal.findUnique({
    where: { id },
    select: { id: true, status: true, title: true, segmentKey: true, dealerId: true, dealer: { select: { isDemo: true } } },
  });
  if (!proposal) throw new ApiError('NOT_FOUND', 'Öneri bulunamadı.');
  if (proposal.status !== 'PENDING') {
    throw new ApiError('CONFLICT', 'Bu öneri için zaten karar verilmiş. Liste yenilendi.', { details: { current: proposal.status } });
  }
  if (input.decision === 'APPROVED' && proposal.dealer.isDemo) {
    throw new ApiError('FORBIDDEN', 'Demo işletmenin önerisi onaylanamaz; yalnız reddedilebilir.');
  }

  await prisma.$transaction(async (tx) => {
    // Koşullu geçiş: yalnız hâlâ PENDING ise yazar (eşzamanlı ikinci karar 409 alır).
    const claim = await tx.segmentCampaignProposal.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: input.decision, decidedAt: now, decidedById: actor.id },
    });
    if (claim.count === 0) {
      const current = await tx.segmentCampaignProposal.findUnique({ where: { id }, select: { status: true } });
      throw new ApiError('CONFLICT', 'Bu öneri için az önce başka bir karar verildi. Liste yenilendi.', {
        details: { current: current?.status ?? null },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        actorType: 'user',
        actorSnapshot: { role: actor.role } as Prisma.InputJsonValue,
        action: input.decision === 'APPROVED' ? 'segment_proposal.approve' : 'segment_proposal.reject',
        entity: PROPOSAL_ENTITY,
        entityId: id,
        oldData: { status: 'PENDING' } as Prisma.InputJsonValue,
        newData: { status: input.decision, note: noteCheck.note, dealerId: proposal.dealerId, segmentKey: proposal.segmentKey } as Prisma.InputJsonValue,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
    });
    const approved = input.decision === 'APPROVED';
    await tx.notification.create({
      data: {
        userId: proposal.dealerId,
        title: approved ? 'Segment kampanyanız onaylandı' : 'Segment kampanyanız onaylanmadı',
        message: approved
          ? `“${proposal.title}” onaylandı. Müşterilerinize göndermek için İnovasyon sayfasını açın.${noteCheck.note ? ` Not: ${noteCheck.note}` : ''}`
          : `“${proposal.title}” onaylanmadı. Gerekçe: ${noteCheck.note}`,
        type: approved ? 'success' : 'warning',
        data: { kind: 'innovation_segment_decision', proposalId: id, decision: input.decision, href: '/dealer/innovation' } as Prisma.InputJsonValue,
      },
    });
  });

  return { id, status: input.decision };
}

export async function bulkDecide(
  ids: string[],
  input: { decision: AdminDecision; note?: string | null },
  actor: ProposalActor
): Promise<BulkDecideResult> {
  const results: BulkDecideResult['results'] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const r = await decideProposal(id, input, actor);
      results.push({ id, ok: true, status: r.status });
    } catch (err) {
      if (err instanceof ApiError) {
        const current =
          err.details && !Array.isArray(err.details) && typeof (err.details as Record<string, unknown>).current === 'string'
            ? ((err.details as Record<string, unknown>).current as string)
            : undefined;
        results.push({ id, ok: false, code: String(err.code), message: err.message, ...(current ? { current } : {}) });
        // Not doğrulaması tüm toplu işlem için aynı; ilkinde durdur.
        if (err.code === 'VALIDATION') break;
      } else {
        throw err;
      }
    }
  }
  return { results };
}
