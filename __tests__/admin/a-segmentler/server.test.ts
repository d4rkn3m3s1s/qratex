/**
 * Segmentler sunucu mantığı — prisma mock. Onay kuyruğu (koşullu geçiş/409, gerekçe, demo, denetim +
 * bayi bildirimi, toplu), modül ayarları (iyimser kilit, https doğrulaması, gizli değer maskesi),
 * genel bakış (paya girmeyenler, sanal kovalar, yüzde toplamı).
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/redis', () => ({
  cachedJson: jest.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  redisSetJson: jest.fn(async () => undefined),
}));
jest.mock('@/lib/innovation-segment-users', () => ({ resolveInnovationSegmentUserIds: jest.fn(async () => ['c1', 'c2', 'c2']) }));
jest.mock('@/lib/marketing-delivery', () => ({
  resolveMarketingAudience: jest.fn(async (ids: string[]) => ({ reachCount: ids.length - 1, optedOutCount: 1, candidateCount: ids.length })),
}));

const cfgStore: { value: Record<string, unknown> } = { value: {} };
jest.mock('@/lib/innovation-config', () => ({
  INNOVATION_PLATFORM_SETTINGS_KEY: 'innovationPlatform',
  getInnovationPlatformConfig: jest.fn(async () => ({
    features: { segmentProposals: true, flashOffers: true, tablePulse: true, weeklyBrief: true, remedyTimeline: true, partnerDigestApi: true, staffTableInsights: true, nearbyRadar: true },
    referral: { maxInvitesPerReferrerLifetime: 100, maxRedemptionsPerReferralCodePerMonth: 30 },
    compliance: { retentionDaysPersonalData: 730, deletionRequestContactEmail: 'x' },
    partnerDigest: { webhookUrl: '', webhookSecret: 'supersecretvalue1234', webhookEnabled: false },
    campaignAb: { defaultSplitPercentForB: 50, experiments: [] },
    ...cfgStore.value,
  })),
}));

const tx = {
  segmentCampaignProposal: { updateMany: jest.fn(), findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  settings: { findUnique: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn() },
};
const db = {
  segmentCampaignProposal: { findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn() },
  customerSegment: { findMany: jest.fn() },
  customerLifetimeValue: { groupBy: jest.fn(), aggregate: jest.fn() },
  user: { count: jest.fn(), findMany: jest.fn() },
  auditLog: { findMany: jest.fn(async () => []) },
  analyticsEvent: { findMany: jest.fn(async () => []) },
  settings: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { bulkDecide, decideProposal, getProposalDetail } from '@/components/admin/a-segmentler/server/proposals';
import { getModules, patchModules, rotateWebhookSecret } from '@/components/admin/a-segmentler/server/modules';
import { getSegmentOverview } from '@/components/admin/a-segmentler/server/segments';
import { DecideBody } from '@/components/admin/a-segmentler/server/schemas';

const actor = { id: 'admin1', role: 'ADMIN' };
const V1 = new Date('2026-10-10T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  cfgStore.value = {};
  db.segmentCampaignProposal.findUnique.mockResolvedValue({
    id: 'p1',
    status: 'PENDING',
    title: 'Sizi özledik',
    segmentKey: 'sleeping',
    dealerId: 'd1',
    dealer: { isDemo: false },
  });
  tx.segmentCampaignProposal.updateMany.mockResolvedValue({ count: 1 });
});

describe('öneri kararı', () => {
  it('PATCH şeması SENT kabul etmez (gönderildi kısayolu kaldırıldı)', () => {
    expect(DecideBody.safeParse({ decision: 'SENT' }).success).toBe(false);
    expect(DecideBody.safeParse({ decision: 'APPROVED', extra: 1 }).success).toBe(false);
  });

  it('onay: koşullu geçiş + denetim (not dahil) + bayiye bildirim', async () => {
    const res = await decideProposal('p1', { decision: 'APPROVED', note: 'Uygun' }, actor);
    expect(res).toEqual({ id: 'p1', status: 'APPROVED' });
    expect(tx.segmentCampaignProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', status: 'PENDING' }, data: expect.objectContaining({ status: 'APPROVED', decidedById: 'admin1' }) })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'segment_proposal.approve', entityId: 'p1', newData: expect.objectContaining({ note: 'Uygun' }) }) })
    );
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'd1', type: 'success' }) }));
  });

  it('ret gerekçesiz reddedilir, hiçbir şey yazılmaz', async () => {
    await expect(decideProposal('p1', { decision: 'REJECTED', note: '' }, actor)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('ret gerekçesi bayi bildirimine gider', async () => {
    await decideProposal('p1', { decision: 'REJECTED', note: 'Vaat edilen kod tanımlı değil' }, actor);
    const n = tx.notification.create.mock.calls[0][0].data;
    expect(n.message).toContain('Vaat edilen kod tanımlı değil');
    expect(n.type).toBe('warning');
  });

  it('karar verilmiş öneri (bayat liste) 409 — SENT geri APPROVED yapılamaz', async () => {
    db.segmentCampaignProposal.findUnique.mockResolvedValue({ id: 'p1', status: 'SENT', title: 't', segmentKey: 'loyal', dealerId: 'd1', dealer: { isDemo: false } });
    await expect(decideProposal('p1', { decision: 'APPROVED' }, actor)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('eşzamanlı karar: koşullu güncelleme 0 satır → 409, denetim/bildirim yok', async () => {
    tx.segmentCampaignProposal.updateMany.mockResolvedValue({ count: 0 });
    tx.segmentCampaignProposal.findUnique.mockResolvedValue({ status: 'REJECTED' });
    await expect(decideProposal('p1', { decision: 'APPROVED' }, actor)).rejects.toMatchObject({ code: 'CONFLICT', details: { current: 'REJECTED' } });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('demo işletmenin önerisi onaylanamaz', async () => {
    db.segmentCampaignProposal.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', title: 't', segmentKey: 'loyal', dealerId: 'd1', dealer: { isDemo: true } });
    await expect(decideProposal('p1', { decision: 'APPROVED' }, actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('toplu karar satır bazlı sonuç döner', async () => {
    db.segmentCampaignProposal.findUnique
      .mockResolvedValueOnce({ id: 'a', status: 'PENDING', title: 't', segmentKey: 'loyal', dealerId: 'd1', dealer: { isDemo: false } })
      .mockResolvedValueOnce({ id: 'b', status: 'APPROVED', title: 't', segmentKey: 'loyal', dealerId: 'd1', dealer: { isDemo: false } });
    const res = await bulkDecide(['a', 'b'], { decision: 'APPROVED' }, actor);
    expect(res.results).toEqual([
      { id: 'a', ok: true, status: 'APPROVED' },
      expect.objectContaining({ id: 'b', ok: false, code: 'CONFLICT', current: 'APPROVED' }),
    ]);
  });
});

describe('öneri detayı', () => {
  it('kitle: tekil aday, rıza kapısı, son 30 gün; şablon karşılaştırması', async () => {
    db.segmentCampaignProposal.findUnique.mockResolvedValue({
      id: 'p1',
      title: 'Uykuda — nazik hatırlatma',
      message: 'Sizi özledik. Bu hafta gelen misafirlerimize özel küçük bir sürpriz hazırladık; QR ile haber verin, yer ayıralım.',
      segmentKey: 'sleeping',
      status: 'PENDING',
      createdAt: new Date('2026-10-10T00:00:00Z'),
      decidedAt: null,
      decidedById: null,
      dealerId: 'd1',
      dealer: { id: 'd1', businessName: 'Ada Kafe', name: null, email: null, isDemo: false },
    });
    db.segmentCampaignProposal.groupBy.mockResolvedValue([{ status: 'SENT', _count: { _all: 3 } }, { status: 'REJECTED', _count: { _all: 1 } }]);
    db.segmentCampaignProposal.findMany.mockResolvedValue([]);
    const d = await getProposalDetail('p1', new Date('2026-10-11T00:00:00Z'));
    expect(d.audience).toEqual({ candidates: 2, considered: 2, truncated: false, reach: 1, optedOut: 1 });
    expect(d.dealerStats).toEqual({ sentLast30d: 3, proposalsLast30d: 4, rejectedLast30d: 1 });
    expect(d.templateUnchanged).toBe(true);
    expect(d.dealer.label).toBe('Ada Kafe');
  });
});

describe('modül ayarları', () => {
  beforeEach(() => {
    db.settings.findUnique.mockResolvedValue({ updatedAt: V1 });
    tx.settings.findUnique.mockResolvedValue({ updatedAt: V1 });
    tx.settings.updateMany.mockResolvedValue({ count: 1 });
    tx.settings.findUniqueOrThrow.mockResolvedValue({ updatedAt: new Date('2026-10-10T11:00:00.000Z') });
  });

  it('GET gizli değeri döndürmez', async () => {
    const s = await getModules();
    expect(JSON.stringify(s)).not.toContain('supersecretvalue1234');
    expect(s.partnerDigest).toMatchObject({ hasSecret: true, secretLast4: '1234' });
    expect(s.version).toBe(V1.toISOString());
  });

  it('bayrak kapatma: sürümle koşullu yazım + yalnız fark denetime', async () => {
    const s = await patchModules({ section: 'features', features: { flashOffers: false } }, V1.toISOString(), actor);
    expect(s.features.flashOffers).toBe(false);
    expect(tx.settings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'innovationPlatform', updatedAt: V1 } }));
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.oldData).toEqual({ features: { flashOffers: true } });
    expect(audit.newData).toEqual({ features: { flashOffers: false } });
  });

  it('bayat sürüm 409', async () => {
    await expect(patchModules({ section: 'features', features: { flashOffers: false } }, '2026-01-01T00:00:00.000Z', actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.settings.updateMany).not.toHaveBeenCalled();
  });

  it('iç ağ webhook adresi reddedilir', async () => {
    await expect(
      patchModules({ section: 'partnerDigest', partnerDigest: { enabled: true, url: 'https://169.254.169.254/x' } }, V1.toISOString(), actor)
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('gizli değer sunucuda üretilir, denetime düz metin yazılmaz', async () => {
    const r = await rotateWebhookSecret(V1.toISOString(), actor);
    expect(r.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0][0].data)).not.toContain(r.secret);
    expect(r.state.partnerDigest.secretLast4).toBe(r.secret.slice(-4));
  });
});

describe('segment genel bakışı', () => {
  it('paya giren müşteri, sanal kovalar ve yüzde toplamı', async () => {
    db.customerSegment.findMany.mockResolvedValue([
      { id: 's-vip', name: 'VIP', description: null, color: null, isActive: true },
      { id: 's-new', name: 'Yeni', description: null, color: null, isActive: true },
    ]);
    db.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(4);
    db.customerLifetimeValue.groupBy.mockResolvedValue([
      { segmentId: 's-vip', _count: { _all: 10 }, _avg: { totalSpent: 7000, predictedChurn: 0.1 } },
      { segmentId: 's-new', _count: { _all: 30 }, _avg: { totalSpent: 200, predictedChurn: null } },
      { segmentId: null, _count: { _all: 20 }, _avg: { totalSpent: 900, predictedChurn: null } },
    ]);
    db.customerLifetimeValue.aggregate.mockResolvedValue({ _max: { calculatedAt: V1 } });
    db.segmentCampaignProposal.count.mockResolvedValue(2);
    const o = await getSegmentOverview({ fresh: true });
    expect(o.totals).toEqual({ customers: 100, withClv: 60, uncomputed: 40, unsegmented: 20, excludedSuspicious: 4 });
    expect(o.segments.map((s) => s.id)).toEqual(['s-new', 's-vip', 'none', 'uncomputed']);
    expect(o.segments.reduce((a, s) => a + s.share, 0)).toBe(100);
    // Paya giren tanım: gölge yasaklı/demo/anonim hariç.
    expect(db.customerLifetimeValue.groupBy.mock.calls[0][0].where.user).toMatchObject({ role: 'CUSTOMER', isDemo: false, anonymizedAt: null, fraudStatus: { not: 'shadow_ban' } });
    expect(o.pendingProposals).toBe(2);
  });
});
