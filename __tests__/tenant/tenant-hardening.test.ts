/**
 * A3 kiracı/IDOR şeridi — ek sertleştirmeler (P0-05, P0-11, P0-12, P0-04 davet akışı yan etkileri).
 *
 * Saldırı / hata senaryoları:
 *  - `lib/api-auth` `dealerScopeWhere` / `userScopeWhere` STAFF ve tanınmayan rolde `{}` (= bütün
 *    kiracılar) dönüyordu → artık hiçbir satırla eşleşmeyen filtre.
 *  - Kalıcı `DealerCustomerStats` bayat satır tutuyordu (tüketimi silinen müşteri bayi listesinde
 *    kalıyordu) → yeniden hesapta dokunulmayan satırlar silinir; hata olursa SİLİNMEZ.
 *  - Churn müdahalesi için bayi-yerel risk listesi: rakip işletmedeki ziyaret pasifliği etkilemez.
 *  - Personel PIN'i PATCH yanıtında ham dönüyordu; maskeli PIN geri gönderilince 400 alınıyordu.
 *  - Vardiya/görev, işten ayrılmış (pasif) personele atanabiliyordu.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
const mockRedisSet = jest.fn(async () => undefined);
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: (...a: unknown[]) => (mockRedisSet as (...x: unknown[]) => unknown)(...a),
  redisIncrWithTtl: jest.fn(async () => null),
}));

import { db, resetDb, $transaction } from '../helpers/prisma-proxy';
import { IMPOSSIBLE_SCOPE_ID } from '@/lib/auth/scope';
import { as, setSession } from '../helpers/session-mock';

const NOW = new Date('2026-10-08T00:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
}

beforeEach(() => {
  resetDb();
  mockRedisSet.mockClear();
});

// ───────────────────────────── lib/api-auth eski yardımcılar ─────────────────────────────

describe('lib/api-auth dealerScopeWhere / userScopeWhere — varsayılan reddet', () => {
  // Gerçek modül (dosya düzeyinde sahtesi var; yalnız saf yardımcılar çağrılır).
  const { dealerScopeWhere, userScopeWhere } = jest.requireActual('@/lib/api-auth') as typeof import('@/lib/api-auth');
  const s = (id: string | undefined, role: string) => ({ user: { id, role }, expires: '2099' }) as never;

  it.each([
    ['STAFF', s('staff-1', 'STAFF')],
    ['CUSTOMER', s('cust-1', 'CUSTOMER')],
    ['tanınmayan rol', s('x-1', 'SUPERUSER')],
    ['kimliksiz ADMIN', s(undefined, 'ADMIN')],
  ])('dealerScopeWhere: %s → imkânsız filtre (eskiden {} = bütün kiracılar)', (_l, session) => {
    expect(dealerScopeWhere(session)).toEqual({ dealerId: IMPOSSIBLE_SCOPE_ID });
  });

  it.each([
    ['STAFF', s('staff-1', 'STAFF')],
    ['DEALER', s('dealer-a', 'DEALER')],
    ['tanınmayan rol', s('x-1', 'SUPERUSER')],
  ])('userScopeWhere: %s → imkânsız filtre', (_l, session) => {
    expect(userScopeWhere(session)).toEqual({ userId: IMPOSSIBLE_SCOPE_ID });
  });

  it('ADMIN / DEALER / CUSTOMER davranışı değişmez', () => {
    expect(dealerScopeWhere(s('admin-1', 'ADMIN'))).toEqual({});
    expect(dealerScopeWhere(s('dealer-a', 'DEALER'))).toEqual({ dealerId: 'dealer-a' });
    expect(userScopeWhere(s('admin-1', 'ADMIN'))).toEqual({});
    expect(userScopeWhere(s('cust-1', 'CUSTOMER'))).toEqual({ userId: 'cust-1' });
  });
});

// ───────────────────────────── DealerCustomerStats kalıcı katman ─────────────────────────────

describe('recomputeDealerCustomerStats — bayat satır temizliği (P0-12)', () => {
  const spendRow = (customerId: string, amount: number) => ({
    customerId,
    _sum: { amount },
    _count: { _all: 1 },
    _avg: { amount },
    _min: { createdAt: day(3) },
    _max: { createdAt: day(3) },
  });

  it('bu turda yazılmayan satırlar (tüketimi kalmayan müşteri) silinir; upsert tx parçalı', async () => {
    db.consumption.groupBy.mockResolvedValue([spendRow('c1', 40), spendRow('c2', 60)]);
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);
    db.dealerCustomerStats.upsert.mockResolvedValue({});
    db.dealerCustomerStats.deleteMany.mockResolvedValue({ count: 1 });

    const { recomputeDealerCustomerStats } = await import('@/lib/dealer-customer-stats');
    expect(await recomputeDealerCustomerStats('dealer-a', NOW)).toBe(2);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(db.dealerCustomerStats.upsert).toHaveBeenCalledTimes(2);
    for (const [args] of db.dealerCustomerStats.upsert.mock.calls) {
      expect(args.where.dealerId_customerId.dealerId).toBe('dealer-a');
      expect(args.update.calculatedAt).toEqual(NOW);
    }
    expect(db.dealerCustomerStats.deleteMany).toHaveBeenCalledWith({
      where: { dealerId: 'dealer-a', calculatedAt: { lt: NOW } },
    });
  });

  it('upsert başarısızsa hiçbir satır SİLİNMEZ (yarım hesapla veri kaybı yok)', async () => {
    db.consumption.groupBy.mockResolvedValue([spendRow('c1', 40)]);
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);
    db.dealerCustomerStats.upsert.mockRejectedValue(new Error('db down'));

    const { recomputeDealerCustomerStats } = await import('@/lib/dealer-customer-stats');
    await expect(recomputeDealerCustomerStats('dealer-a', NOW)).rejects.toThrow('db down');
    expect(db.dealerCustomerStats.deleteMany).not.toHaveBeenCalled();
  });

  it('bayide hiç tüketim kalmadıysa bayinin bütün satırları temizlenir', async () => {
    db.consumption.groupBy.mockResolvedValue([]);
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);
    db.dealerCustomerStats.deleteMany.mockResolvedValue({ count: 3 });

    const { recomputeDealerCustomerStats } = await import('@/lib/dealer-customer-stats');
    expect(await recomputeDealerCustomerStats('dealer-a', NOW)).toBe(0);
    expect(db.dealerCustomerStats.upsert).not.toHaveBeenCalled();
    expect(db.dealerCustomerStats.deleteMany.mock.calls[0][0].where.dealerId).toBe('dealer-a');
  });
});

describe('listDealerAtRiskCustomers — bayi-yerel risk ve pasiflik', () => {
  it('yalnız bu bayinin verisi: eşik + bu bayideki son ziyaret; churn azalan sıralı', async () => {
    db.consumption.groupBy.mockResolvedValue([
      // c1: bu bayide 40 gündür yok (rakipte dün olsa bile sorguya girmez) → listede
      { customerId: 'c1', _sum: { amount: 10 }, _count: { _all: 1 }, _avg: { amount: 10 }, _min: { createdAt: day(90) }, _max: { createdAt: day(40) } },
      // c2: dün geldi → pasif değil
      { customerId: 'c2', _sum: { amount: 10 }, _count: { _all: 1 }, _avg: { amount: 10 }, _min: { createdAt: day(90) }, _max: { createdAt: day(1) } },
      // c3: pasif ama risk düşük
      { customerId: 'c3', _sum: { amount: 10 }, _count: { _all: 1 }, _avg: { amount: 10 }, _min: { createdAt: day(90) }, _max: { createdAt: day(60) } },
      // c4: pasif, en yüksek risk
      { customerId: 'c4', _sum: { amount: 10 }, _count: { _all: 1 }, _avg: { amount: 10 }, _min: { createdAt: day(90) }, _max: { createdAt: day(35) } },
    ]);
    db.feedback.groupBy.mockImplementation(async (args: { _avg: Record<string, boolean> }) =>
      args._avg.churnRisk
        ? [
            { userId: 'c1', _avg: { churnRisk: 0.7 }, _count: { churnRisk: 1 } },
            { userId: 'c2', _avg: { churnRisk: 0.9 }, _count: { churnRisk: 1 } },
            { userId: 'c3', _avg: { churnRisk: 0.2 }, _count: { churnRisk: 1 } },
            { userId: 'c4', _avg: { churnRisk: 0.95 }, _count: { churnRisk: 1 } },
          ]
        : []
    );
    db.consumptionReview.groupBy.mockResolvedValue([]);

    const { listDealerAtRiskCustomers } = await import('@/lib/dealer-customer-stats');
    const out = await listDealerAtRiskCustomers('dealer-a', { churnThreshold: 0.6, inactiveBefore: day(30), now: NOW });
    expect(out.map((r) => r.customerId)).toEqual(['c4', 'c1']);
    expect(db.consumption.groupBy.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a' });
    expect(db.customerLifetimeValue.findMany).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Bayi personel uçları ─────────────────────────────

describe('bayi personel uçları', () => {
  // Bu blok `requireAuth` sahtesini (helpers/session-mock) kullanır.
  async function asDealer() {
    setSession(as('dealer-a', 'DEALER'));
  }

  const STAFF_ROW = {
    id: 'ds-1',
    userId: 'staff-1',
    dealerId: 'dealer-a',
    jobTitle: 'Garson',
    pinCode: '4321',
    isActive: false,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('PATCH [id]: maskeli PIN (****) "değişmedi" sayılır; yanıtta PIN ham dönmez; pasifleştirme oturum önbelleğini düşürür', async () => {
    await asDealer();
    db.dealerStaff.updateMany.mockResolvedValue({ count: 1 });
    db.dealerStaff.findUnique.mockResolvedValue(STAFF_ROW);
    db.auditLog.create.mockResolvedValue({});
    const { PATCH } = await import('@/app/api/dealer/staff/[id]/route');
    const res = await PATCH(
      req('/api/dealer/staff/ds-1', { method: 'PATCH', body: { jobTitle: 'Garson', pinCode: '****', isActive: false } }),
      { params: Promise.resolve({ id: 'ds-1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(db.dealerStaff.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'ds-1', dealerId: 'dealer-a' },
      data: { jobTitle: 'Garson', isActive: false },
    });
    expect(data.staff.pinCode).toBe('****');
    expect(JSON.stringify(data)).not.toContain('4321');
    const keys = mockRedisSet.mock.calls.map((c) => (c as unknown[])[0]);
    expect(keys).toEqual(expect.arrayContaining(['scope:staff:staff-1']));
    expect(keys.some((k) => typeof k === 'string' && k.includes('staff-1') && k !== 'scope:staff:staff-1')).toBe(true);
  });

  it('PATCH [id]: geçersiz PIN yine 400', async () => {
    await asDealer();
    const { PATCH } = await import('@/app/api/dealer/staff/[id]/route');
    const res = await PATCH(req('/api/dealer/staff/ds-1', { method: 'PATCH', body: { pinCode: '12' } }), {
      params: Promise.resolve({ id: 'ds-1' }),
    });
    expect(res.status).toBe(400);
    expect(db.dealerStaff.updateMany).not.toHaveBeenCalled();
  });

  it('vardiya: pasif/ayrılmış personele atanamaz → 400, kayıt yok', async () => {
    await asDealer();
    db.dealerStaff.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/dealer/staff/shifts/route');
    const res = await POST(
      req('/api/dealer/staff/shifts', {
        method: 'POST',
        body: { userId: 'former-staff', date: '2026-10-10', startTime: '09:00', endTime: '17:00' },
      })
    );
    expect(res.status).toBe(400);
    expect(db.dealerStaff.findFirst.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a', userId: 'former-staff', isActive: true });
    expect(db.staffShift.create).not.toHaveBeenCalled();
  });

  it('görev: pasif/ayrılmış personele atanamaz → 400; bozuk gövde 400 (500 değil)', async () => {
    await asDealer();
    db.dealerStaff.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/dealer/staff/tasks/route');
    const res = await POST(req('/api/dealer/staff/tasks', { method: 'POST', body: { assignedTo: 'former-staff', title: 'Kasa sayımı' } }));
    expect(res.status).toBe(400);
    expect(db.dealerStaff.findFirst.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a', userId: 'former-staff', isActive: true });
    expect(db.staffTask.create).not.toHaveBeenCalled();

    const bad = new NextRequest('http://localhost/api/dealer/staff/tasks', {
      method: 'POST',
      body: '{bozuk',
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
