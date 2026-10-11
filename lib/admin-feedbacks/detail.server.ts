/**
 * Tek geri bildirimin tam bağlamı (detay çekmecesi): AI sinyalleri, bayi yanıtı, telafi
 * teklifleri, moderasyon geçmişi. GET'te LLM çağrısı yok — yalnız kayıtlı analiz okunur.
 */
import { prisma } from '@/lib/prisma';
import {
  feedKey,
  normalizeDimensions,
  normalizeStringList,
  type FeedDetail,
  type FeedDetailAudit,
  type FeedSentiment,
  type FeedSource,
} from './contract';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function deriveSentiment(sentiment: string | null, text: string | null, analyzedAt: Date | null, rating: number): FeedSentiment {
  const s = (sentiment ?? '').toLowerCase();
  if (s === 'positive' || s === 'neutral' || s === 'negative') return s;
  if (text && text.trim() && !analyzedAt) return 'pending';
  if (rating <= 2) return 'negative';
  if (rating >= 4) return 'positive';
  return 'neutral';
}

function suggestions(value: unknown): Array<{ action: string; priority: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === 'string') return { action: v, priority: null };
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const a = o.action ?? o.title ?? o.text;
        if (typeof a === 'string' && a.trim()) return { action: a.trim(), priority: typeof o.priority === 'string' ? o.priority : null };
      }
      return null;
    })
    .filter((x): x is { action: string; priority: string | null } => !!x)
    .slice(0, 6);
}

const AUDIT_ENTITY: Record<FeedSource, string> = { qr: 'Feedback', consumption: 'ConsumptionReview' };

async function auditFor(source: FeedSource, id: string): Promise<FeedDetailAudit[]> {
  const rows = await prisma.auditLog.findMany({
    // Karma toplu işlemler tek satıra yazılabildiği için iki varlık adına da bakılır.
    where: { entity: { in: [AUDIT_ENTITY[source], AUDIT_ENTITY[source === 'qr' ? 'consumption' : 'qr']] }, entityId: { contains: id } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, createdAt: true, actorSnapshot: true, newData: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => {
    const snap = (r.actorSnapshot ?? {}) as Record<string, unknown>;
    const nd = (r.newData ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      action: r.action,
      actorName: r.user?.name ?? r.user?.email ?? (typeof snap.name === 'string' ? snap.name : typeof snap.email === 'string' ? snap.email : null),
      createdAt: r.createdAt.toISOString(),
      reason: typeof nd.reason === 'string' ? nd.reason : null,
    };
  });
}

export async function getFeedDetail(source: FeedSource, id: string): Promise<FeedDetail | null> {
  if (source === 'qr') {
    const f = await prisma.feedback.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        rating: true,
        text: true,
        media: true,
        npsScore: true,
        sentiment: true,
        emotions: true,
        topics: true,
        isToxic: true,
        intent: true,
        intentScore: true,
        urgency: true,
        churnRisk: true,
        actionSuggestions: true,
        aiProcessedAt: true,
        aiModelUsed: true,
        dealerReply: true,
        dealerRepliedAt: true,
        dealerFirstViewedAt: true,
        fraudScore: true,
        trustFlagged: true,
        trustReason: true,
        isPublic: true,
        deletedAt: true,
        userId: true,
        user: { select: { id: true, name: true, email: true, isDemo: true, fraudStatus: true } },
        staff: { select: { user: { select: { name: true } } } },
        qrCode: { select: { name: true, dealer: { select: { id: true, businessName: true, name: true } } } },
        remedyOffers: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, status: true, message: true, selectedType: true, selectedValue: true, createdAt: true, acceptedAt: true },
        },
      },
    });
    if (!f) return null;
    const [audit, other] = await Promise.all([
      auditFor('qr', f.id),
      f.userId
        ? Promise.all([
            prisma.feedback.count({ where: { userId: f.userId, deletedAt: null, id: { not: f.id } } }),
            prisma.consumptionReview.count({ where: { customerId: f.userId, deletedAt: null } }),
          ]).then(([a, b]) => a + b)
        : Promise.resolve(null),
    ]);
    const dealer = f.qrCode.dealer;
    return {
      key: feedKey('qr', f.id),
      id: f.id,
      source: 'qr',
      createdAt: f.createdAt.toISOString(),
      rating: f.rating,
      text: f.text,
      sentiment: deriveSentiment(f.sentiment, f.text, f.aiProcessedAt, f.rating),
      dealer: { id: dealer.id, name: dealer.businessName?.trim() || dealer.name || '—' },
      place: f.qrCode.name,
      staffName: f.staff?.user?.name ?? null,
      user: f.user ? { id: f.user.id, name: f.user.name, email: f.user.email, isDemo: !!f.user.isDemo, fraudStatus: f.user.fraudStatus ?? null } : null,
      userOtherReviews: other,
      dealerReply: f.dealerReply,
      dealerRepliedAt: iso(f.dealerRepliedAt),
      dealerFirstViewedAt: iso(f.dealerFirstViewedAt),
      isPublic: f.isPublic,
      deletedAt: iso(f.deletedAt),
      moderation: { isToxic: f.isToxic, trustFlagged: f.trustFlagged, trustReason: f.trustReason, fraudScore: f.fraudScore },
      ai: {
        analyzedAt: iso(f.aiProcessedAt),
        model: f.aiModelUsed,
        intent: f.intent,
        intentScore: f.intentScore,
        urgency: f.urgency,
        churnRisk: f.churnRisk,
        npsScore: f.npsScore,
        emotions: normalizeStringList(f.emotions),
        topics: normalizeStringList(f.topics),
        dimensions: [],
        actionSuggestions: suggestions(f.actionSuggestions),
      },
      mediaCount: Array.isArray(f.media) ? f.media.length : 0,
      remedies: f.remedyOffers.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), acceptedAt: iso(r.acceptedAt) })),
      audit,
    };
  }

  const r = await prisma.consumptionReview.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      rating: true,
      text: true,
      dimensions: true,
      dealerReply: true,
      dealerRepliedAt: true,
      sentiment: true,
      churnRisk: true,
      analyzedAt: true,
      deletedAt: true,
      customerId: true,
      customer: { select: { id: true, name: true, email: true, isDemo: true, fraudStatus: true } },
      consumption: {
        select: { product: { select: { name: true } }, dealer: { select: { id: true, businessName: true, name: true } } },
      },
      remedyOffers: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, message: true, selectedType: true, selectedValue: true, createdAt: true, acceptedAt: true },
      },
    },
  });
  if (!r) return null;
  const [audit, other] = await Promise.all([
    auditFor('consumption', r.id),
    Promise.all([
      prisma.feedback.count({ where: { userId: r.customerId, deletedAt: null } }),
      prisma.consumptionReview.count({ where: { customerId: r.customerId, deletedAt: null, id: { not: r.id } } }),
    ]).then(([a, b]) => a + b),
  ]);
  const dealer = r.consumption.dealer;
  return {
    key: feedKey('consumption', r.id),
    id: r.id,
    source: 'consumption',
    createdAt: r.createdAt.toISOString(),
    rating: r.rating,
    text: r.text,
    sentiment: deriveSentiment(r.sentiment, r.text, r.analyzedAt, r.rating),
    dealer: { id: dealer.id, name: dealer.businessName?.trim() || dealer.name || '—' },
    place: r.consumption.product?.name ?? null,
    staffName: null,
    user: r.customer
      ? { id: r.customer.id, name: r.customer.name, email: r.customer.email, isDemo: !!r.customer.isDemo, fraudStatus: r.customer.fraudStatus ?? null }
      : null,
    userOtherReviews: other,
    dealerReply: r.dealerReply,
    dealerRepliedAt: iso(r.dealerRepliedAt),
    dealerFirstViewedAt: null,
    isPublic: true,
    deletedAt: iso(r.deletedAt),
    moderation: { isToxic: false, trustFlagged: false, trustReason: null, fraudScore: null },
    ai: {
      analyzedAt: iso(r.analyzedAt),
      model: null,
      intent: null,
      intentScore: null,
      urgency: null,
      churnRisk: r.churnRisk,
      npsScore: null,
      emotions: [],
      topics: [],
      dimensions: normalizeDimensions(r.dimensions),
      actionSuggestions: [],
    },
    mediaCount: 0,
    remedies: r.remedyOffers.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), acceptedAt: iso(o.acceptedAt) })),
    audit,
  };
}
