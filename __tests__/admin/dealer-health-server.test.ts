/**
 * Bayi Sağlığı sunucu mantığı — prisma mock. Playbook uygulaması (409, modül kapısı, denetim,
 * bildirim, global görev YOK), CSM görevleri (iyimser kilit, denetim), sinyal toplayıcı birleşimi.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@prisma/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (v: unknown[]) => v,
  },
}));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null), redisSetJson: jest.fn(async () => undefined) }));
jest.mock('@/components/dealer/b-kampanyalar/server/common', () => ({ campaignsAvailable: jest.fn(async () => true) }));
jest.mock('@/components/dealer/b-kampanyalar/server/audience', () => ({
  audienceOverview: jest.fn(async () => ({ segments: [{ key: 'risk', total: 12, reachable: 9 }], computedAt: 'x' })),
}));

const tx = {
  campaign: { findFirst: jest.fn(), create: jest.fn() },
  notification: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  quest: { create: jest.fn() },
  cSMTask: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
};
const db = {
  user: { findFirst: jest.fn(), findMany: jest.fn() },
  campaign: { findFirst: jest.fn(), groupBy: jest.fn() },
  incident: { groupBy: jest.fn() },
  cSMTask: { groupBy: jest.fn(async () => []) },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { applyPlaybook, previewApply } from '@/components/admin/a-bayi-sagligi/server/playbooks';
import { updateCsmTask } from '@/components/admin/a-bayi-sagligi/server/csm';
import { computeSignals } from '@/components/admin/a-bayi-sagligi/server/signals';
import { campaignsAvailable } from '@/components/dealer/b-kampanyalar/server/common';

const actor = { id: 'admin1', role: 'ADMIN' };

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findFirst.mockResolvedValue({ id: 'd1', businessName: 'Ada Kafe', name: null, email: 'a@x.com' });
  (campaignsAvailable as jest.Mock).mockResolvedValue(true);
});

describe('playbook uygula', () => {
  it('kampanya + bayi bildirimi + playbook.apply denetimi; global görev oluşturmaz', async () => {
    tx.campaign.findFirst.mockResolvedValue(null);
    tx.campaign.create.mockResolvedValue({ id: 'c1', title: 'Görüşünüz bizim için önemli — Ada Kafe' });
    const res = await applyPlaybook('low_nps_churn', 'd1', actor);
    expect(res.campaignId).toBe('c1');
    const data = tx.campaign.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ dealerId: 'd1', status: 'draft', playbookSourceId: 'low_nps_churn', targetSegment: 'risk' });
    expect(data.message).not.toMatch(/Playbook|churn/i);
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'd1' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'playbook.apply', entityId: 'c1', userId: 'admin1' }) })
    );
    expect(tx.quest.create).not.toHaveBeenCalled();
  });

  it('aynı playbook için açık taslak varsa 409 ve hiçbir şey yazılmaz', async () => {
    tx.campaign.findFirst.mockResolvedValue({ id: 'old' });
    await expect(applyPlaybook('low_nps_churn', 'd1', actor)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(tx.campaign.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('bayide kampanyalar kapalıysa reddedilir', async () => {
    (campaignsAvailable as jest.Mock).mockResolvedValue(false);
    await expect(applyPlaybook('low_nps_churn', 'd1', actor)).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('bilinmeyen playbook / bayi 404', async () => {
    await expect(applyPlaybook('yok', 'd1', actor)).rejects.toMatchObject({ status: 404 });
    db.user.findFirst.mockResolvedValue(null);
    await expect(applyPlaybook('low_nps_churn', 'dX', actor)).rejects.toMatchObject({ status: 404 });
  });

  it('önizleme: müşteri metni + segment sayımı + mevcut taslak; yazma yok', async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    const p = await previewApply('low_nps_churn', 'd1');
    expect(p.audience).toEqual({ total: 12, reachable: 9 });
    expect(p.campaign.title).toContain('Ada Kafe');
    expect(p.existingDraft).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('CSM görevi güncelle', () => {
  it('beklenen durum farklıysa 409', async () => {
    tx.cSMTask.findUnique.mockResolvedValue({ id: 't1', status: 'resolved', assignedToId: null, dealerId: 'd1' });
    await expect(updateCsmTask('t1', { status: 'in_progress', expectedStatus: 'open' }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.cSMTask.update).not.toHaveBeenCalled();
  });
  it('çözülünce resolvedAt yazılır ve denetlenir', async () => {
    tx.cSMTask.findUnique.mockResolvedValue({ id: 't1', status: 'open', assignedToId: null, dealerId: 'd1' });
    tx.cSMTask.update.mockResolvedValue({ id: 't1', status: 'resolved', dealerId: 'd1' });
    await updateCsmTask('t1', { status: 'resolved', expectedStatus: 'open' }, actor);
    const data = tx.cSMTask.update.mock.calls[0][0].data;
    expect(data.status).toBe('resolved');
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'csm_task.update' }) }));
  });
});

describe('sinyal toplayıcı', () => {
  it('iki yorum kanalını birleştirir, sayıları bigint’ten çevirir, sınırsız bayi listesi', async () => {
    db.user.findMany.mockResolvedValue([
      { id: 'd1', businessName: null, name: 'Ali', email: 'a@x.com', fraudStatus: 'clean', createdAt: new Date('2026-01-01') },
      { id: 'd2', businessName: 'B', name: null, email: 'b@x.com', fraudStatus: 'flagged', createdAt: new Date('2026-01-01') },
    ]);
    const fbRow = { dealerId: 'd1', cur_n: BigInt(2), cur_sum: BigInt(8), cur_rep: BigInt(1), cur_neg: BigInt(0), prev_n: BigInt(1), prev_sum: BigInt(5), prev_rep: BigInt(1), prev_neg: BigInt(0), prev2_n: BigInt(0) };
    const crRow = { ...fbRow, cur_n: BigInt(1), cur_sum: BigInt(1), cur_rep: BigInt(0), cur_neg: BigInt(1) };
    db.$queryRaw
      .mockResolvedValueOnce([fbRow])
      .mockResolvedValueOnce([crRow])
      .mockResolvedValueOnce([{ dealerId: 'd1', cur: BigInt(7), prev: BigInt(3), prev2: BigInt(0) }])
      .mockResolvedValueOnce([{ dealerId: 'd2', queue: BigInt(2), overdue: BigInt(1), oldest: new Date(Date.now() - 72 * 3_600_000) }])
      .mockResolvedValueOnce([{ dealerId: 'd1', new_c: BigInt(4), returned_c: BigInt(1) }]);
    db.incident.groupBy.mockResolvedValue([{ dealerId: 'd2', severity: 'critical', _count: { _all: 1 } }]);

    const snap = await computeSignals(30);
    expect(db.user.findMany.mock.calls[0][0].take).toBeUndefined();
    const d1 = snap.signals.find((s) => s.dealerId === 'd1')!;
    expect(d1.label).toBe('Ali');
    expect(d1.reviews).toEqual({ n: 3, ratingSum: 9, replied: 1, negative: 1 });
    expect(d1.consumptions).toBe(7);
    expect(d1.newCustomers).toBe(4);
    const d2 = snap.signals.find((s) => s.dealerId === 'd2')!;
    expect(d2.incidents.critical).toBe(1);
    expect(d2.remedyQueue).toBe(2);
    expect(Math.round(d2.remedyOldestHours!)).toBe(72);
  });
});
