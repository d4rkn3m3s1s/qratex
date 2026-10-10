/**
 * P0-19 — kullanıcı otomasyonu: yalnız kayıtlı + başka bir yöneticinin onayladığı kural çalışır,
 * puan yalnız defterli yoldan (mintPoints/debitPoints) değişir, tekrar denemede çift kredi yok.
 *
 * Yeniden üretilen saldırı/hata senaryoları (önceden):
 *   - Kural seçmeden "Execute Now" → kayıtsız form ilk 500 müşteriye onaysız 100'er puan.
 *   - API'ye `{ actions:[{ type:'set_role', role:'ADMIN' }] }` → onaysız toplu ADMIN yükseltmesi.
 *   - Aynı admin kendi kuralını onaylıyor; onaydan sonra aksiyonlar değişse de onay kalıyor.
 *   - Negatif puan aksiyonu ham `increment` → eksi bakiye, defter yok.
 *   - İş yeniden denendiğinde aynı kullanıcılara ikinci kez puan.
 */
import { NextRequest, NextResponse } from 'next/server';

const tx = {
  notification: { create: jest.fn(async () => ({})) },
  user: { updateMany: jest.fn(async () => ({ count: 1 })) },
};
const db = {
  user: { findMany: jest.fn(), count: jest.fn() },
  userAutomationRule: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
  userAutomationRun: { create: jest.fn(async () => ({ id: 'run1' })), update: jest.fn(async () => ({})) },
  automationJob: {
    findFirst: jest.fn(),
    create: jest.fn(async () => ({ id: 'job1' })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({})),
  },
  auditLog: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

const mockMint = jest.fn();
jest.mock('@/lib/economy/mint', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
const mockDebit = jest.fn();
jest.mock('@/lib/points-wallet', () => {
  const actual = jest.requireActual('@/lib/points-wallet');
  return { ...actual, debitPoints: (...a: unknown[]) => mockDebit(...a) };
});
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'adminB', role: 'ADMIN' } } })),
}));
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({ ipAddress: null, userAgent: null }) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/idempotency', () => ({
  withIdempotency: async (_r: unknown, _n: string, h: () => Promise<{ statusCode: number; body: unknown }>) => {
    const r = await h();
    return NextResponse.json(r.body, { status: r.statusCode });
  },
}));

import { InsufficientPointsError } from '@/lib/points-wallet';
import {
  approvalViolation,
  automationActionSchema,
  automationFingerprint,
  executionBlocker,
  parseAutomation,
  runImpact,
} from '@/lib/users-automation/schema';
import { runAutomationActions } from '@/lib/users-automation/engine';
import { processNextAutomationJob } from '@/lib/users-automation/queue';

const ACTIONS = [{ type: 'add_points', amount: 100, reason: 'Otomasyon kuralı' }];
const CONDITION = { role: 'CUSTOMER' };
const approvedRule = {
  id: 'rule1',
  isActive: true,
  requiresApproval: true,
  approvedAt: new Date(),
  approvedById: 'adminB',
  createdById: 'adminA',
  updatedById: 'adminA',
  condition: CONDITION,
  actions: ACTIONS,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMint.mockResolvedValue({ duplicate: false, credited: 100, status: 'posted' });
  mockDebit.mockResolvedValue({ duplicate: false });
  db.user.findMany.mockResolvedValue([{ id: 'u1', role: 'CUSTOMER' }, { id: 'u2', role: 'CUSTOMER' }]);
  db.user.count.mockResolvedValue(2);
});

describe('şema', () => {
  it('set_role ile ADMIN üretilemez; gerekçesiz / sınırsız puan aksiyonu reddedilir', () => {
    expect(automationActionSchema.safeParse({ type: 'set_role', role: 'ADMIN' }).success).toBe(false);
    expect(automationActionSchema.safeParse({ type: 'add_points', amount: 100 }).success).toBe(false);
    expect(automationActionSchema.safeParse({ type: 'add_points', amount: 1_000_000, reason: 'Çok büyük' }).success).toBe(false);
    expect(automationActionSchema.safeParse({ type: 'add_points', amount: 1.5, reason: 'Ondalık tutar' }).success).toBe(false);
    expect(parseAutomation({ role: 'CUSTOMER', hack: 1 }, ACTIONS).ok).toBe(false);
  });

  it('dört göz: oluşturan ya da son değiştiren onaylayamaz; onaysız/öz-onaylı kural çalışmaz', () => {
    expect(approvalViolation({ createdById: 'a', updatedById: 'a', approverId: 'a' })).toMatch(/oluşturan/);
    expect(approvalViolation({ createdById: 'a', updatedById: 'b', approverId: 'b' })).toMatch(/son değiştiren/);
    expect(approvalViolation({ createdById: 'a', updatedById: 'a', approverId: 'b' })).toBeNull();
    expect(executionBlocker({ ...approvedRule, approvedAt: null, approvedById: null })).toMatch(/onaylanmadı/);
    expect(executionBlocker({ ...approvedRule, approvedById: 'adminA' })).toMatch(/oluşturan/);
    expect(executionBlocker(approvedRule)).toBeNull();
  });

  it('çalıştırma etkisi ve tavan; parmak izi anahtar sırasından bağımsız', () => {
    const p = parseAutomation(CONDITION, ACTIONS);
    if (!p.ok) throw new Error('parse');
    expect(runImpact(p.actions, 500)).toMatchObject({ totalPointsDelta: 50_000, withinCap: true });
    expect(runImpact([{ type: 'add_points', amount: 10_000, reason: 'Büyük ödül' }], 1000).withinCap).toBe(false);
    expect(automationFingerprint({ a: 1, b: 2 }, [{ x: 1, y: 2 }])).toBe(automationFingerprint({ b: 2, a: 1 }, [{ y: 2, x: 1 }]));
  });
});

describe('motor', () => {
  it('pozitif puan mintPoints ile, (iş × aksiyon × kullanıcı) tek-kez anahtarıyla; çalıştıran hariç', async () => {
    const r = await runAutomationActions({ condition: CONDITION, actions: ACTIONS as never, runKey: 'job1', actorId: 'adminB' });
    expect(r).toMatchObject({ affectedCount: 2, successCount: 2, failedCount: 0 });
    expect(mockMint).toHaveBeenCalledTimes(2);
    expect(mockMint.mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      points: 100,
      source: 'automation',
      idempotencyKey: 'automation:job1:0:u1',
      actorId: 'adminB',
    });
    const where = (db.user.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ role: 'CUSTOMER', id: { not: 'adminB' }, suspendedAt: null, anonymizedAt: null });
  });

  it('negatif puan debitPoints ile; yetersiz bakiye eksiye düşmez, kullanıcı hatası olarak raporlanır', async () => {
    mockDebit.mockRejectedValueOnce(new InsufficientPointsError(40, 100));
    const r = await runAutomationActions({
      condition: CONDITION,
      actions: [{ type: 'add_points', amount: -100, reason: 'Ceza düzeltmesi' }] as never,
      runKey: 'job1',
    });
    expect(mockMint).not.toHaveBeenCalled();
    expect(mockDebit).toHaveBeenCalledTimes(2);
    expect(r.failedCount).toBe(1);
    expect(r.failures[0].error).toMatch(/Yetersiz bakiye/);
  });

  it('set_role ADMIN hesaplara dokunmaz ve oturum sürümünü artırır', async () => {
    db.user.findMany.mockResolvedValueOnce([{ id: 'a1', role: 'ADMIN' }, { id: 'u1', role: 'DEALER' }]);
    await runAutomationActions({ condition: {}, actions: [{ type: 'set_role', role: 'CUSTOMER' }] as never, runKey: 'job1' });
    expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.user.updateMany.mock.calls[0]).toEqual([
      { where: { id: 'u1', role: { not: 'ADMIN' } }, data: { role: 'CUSTOMER', sessionVersion: { increment: 1 } } },
    ]);
  });

  it('kayıtlı bozuk aksiyon (ör. eski set_role ADMIN) çalışmaz — fail-closed', async () => {
    await expect(
      runAutomationActions({ condition: {}, actions: [{ type: 'set_role', role: 'ADMIN' }] as never, runKey: 'job1' })
    ).rejects.toThrow(/Geçersiz aksiyon/);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('çalıştırma kimliği olmadan gerçek çalıştırma yok', async () => {
    await expect(runAutomationActions({ condition: CONDITION, actions: ACTIONS as never })).rejects.toThrow(/kimliği/);
  });
});

describe('kuyruk', () => {
  const job = (over: Record<string, unknown> = {}) => ({
    id: 'job1',
    runId: 'run1',
    ruleId: 'rule1',
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: new Date(),
    payload: { condition: CONDITION, actions: ACTIONS, limit: 500, actorId: 'adminB' },
    ...over,
  });

  it('kuralsız (ad-hoc) iş çalıştırılmaz → cancelled', async () => {
    db.automationJob.findFirst.mockResolvedValueOnce(job({ ruleId: null }));
    const r = await processNextAutomationJob('t');
    expect(r?.status).toBe('cancelled');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('onayı kaldırılmış ya da kuyruktan sonra değişmiş kural çalışmaz', async () => {
    db.automationJob.findFirst.mockResolvedValueOnce(job());
    db.userAutomationRule.findUnique.mockResolvedValueOnce({ ...approvedRule, approvedAt: null, approvedById: null });
    expect((await processNextAutomationJob('t'))?.status).toBe('cancelled');

    db.automationJob.findFirst.mockResolvedValueOnce(job());
    db.userAutomationRule.findUnique.mockResolvedValueOnce({
      ...approvedRule,
      actions: [{ type: 'add_points', amount: 9999, reason: 'Değişti' }],
    });
    expect((await processNextAutomationJob('t'))?.status).toBe('cancelled');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('onaylı kural: iş id’si tek-kez anahtarının kökü (yeniden denemede aynı anahtarlar)', async () => {
    db.automationJob.findFirst.mockResolvedValueOnce(job());
    db.userAutomationRule.findUnique.mockResolvedValueOnce(approvedRule);
    const r = await processNextAutomationJob('t');
    expect(r?.status).toBe('completed');
    expect(mockMint.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey)).toEqual([
      'automation:job1:0:u1',
      'automation:job1:0:u2',
    ]);
  });
});

describe('execute ucu', () => {
  async function execute(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/admin/users/automation/execute/route');
    const req = new NextRequest('http://localhost/api/admin/users/automation/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    return { status: res.status, body: await res.json() };
  }

  it('kayıtsız form (condition/actions) ile çalıştırma 400 RULE_REQUIRED', async () => {
    const r = await execute({ condition: { role: 'CUSTOMER' }, actions: [{ type: 'set_role', role: 'ADMIN' }] });
    expect(r.status).toBe(400);
    expect(db.automationJob.create).not.toHaveBeenCalled();
  });

  it('onaysız ya da kendi kendine onaylanmış kural 403', async () => {
    db.userAutomationRule.findUnique.mockResolvedValueOnce({ ...approvedRule, approvedAt: null, approvedById: null });
    expect((await execute({ ruleId: 'rule1' })).status).toBe(403);
    db.userAutomationRule.findUnique.mockResolvedValueOnce({ ...approvedRule, approvedById: 'adminA' });
    expect((await execute({ ruleId: 'rule1' })).status).toBe(403);
    expect(db.automationJob.create).not.toHaveBeenCalled();
  });

  it('onay değerleri gönderilmeden / uyuşmadan 409 + önizleme; doğru değerlerle 202', async () => {
    db.userAutomationRule.findUnique.mockResolvedValue(approvedRule);
    const noConfirm = await execute({ ruleId: 'rule1', processNow: false });
    expect(noConfirm.status).toBe(409);
    expect(noConfirm.body.preview).toMatchObject({ affectedCount: 2, totalPointsDelta: 200 });

    const wrong = await execute({ ruleId: 'rule1', processNow: false, confirm: { affectedCount: 2, totalPointsDelta: 100 } });
    expect(wrong.status).toBe(409);
    expect(db.automationJob.create).not.toHaveBeenCalled();

    const okRes = await execute({ ruleId: 'rule1', processNow: false, confirm: { affectedCount: 2, totalPointsDelta: 200 } });
    expect(okRes.status).toBe(202);
    expect(db.automationJob.create).toHaveBeenCalledTimes(1);
    db.userAutomationRule.findUnique.mockReset();
  });
});

describe('kural PUT (dört göz)', () => {
  async function put(body: Record<string, unknown>) {
    const { PUT } = await import('@/app/api/admin/users/automation/rules/[id]/route');
    const req = new NextRequest('http://localhost/api/admin/users/automation/rules/rule1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'rule1' }) });
    return { status: res.status, body: await res.json() };
  }

  it('kuralı oluşturan kendi kuralını onaylayamaz', async () => {
    db.userAutomationRule.findUnique.mockResolvedValueOnce({ ...approvedRule, createdById: 'adminB', updatedById: 'adminB', approvedAt: null, approvedById: null });
    const r = await put({ approved: true });
    expect(r.status).toBe(403);
    expect(db.userAutomationRule.update).not.toHaveBeenCalled();
  });

  it('içerik değişince onay sıfırlanır; aynı istekte değiştirip onaylamak reddedilir', async () => {
    db.userAutomationRule.findUnique.mockResolvedValueOnce(approvedRule);
    const changed = await put({ actions: [{ type: 'add_points', amount: 5000, reason: 'Yeni tutar' }] });
    expect(changed.status).toBe(200);
    const data = (db.userAutomationRule.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ approvedById: null, approvedAt: null, updatedById: 'adminB' });

    db.userAutomationRule.findUnique.mockResolvedValueOnce(approvedRule);
    const both = await put({ approved: true, actions: [{ type: 'add_points', amount: 5000, reason: 'Yeni tutar' }] });
    expect(both.status).toBe(403);
  });
});
