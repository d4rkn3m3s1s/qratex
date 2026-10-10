/**
 * P0-19 — admin sürpriz kutu gönderimi artık tavansız ve izsiz bir mint kanalı değil.
 *
 * Önceden: tek POST ile 500 alıcıya kişi başı sınırsız puan (ör. 1.000.000) yazılabiliyordu,
 * AuditLog yoktu, "rastgele" seçim tablo başıydı, gölge banlı hesaplar dahildi.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'admin1', role: 'ADMIN', email: 'a@x.com', name: 'Admin' } } })),
}));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({ ipAddress: null, userAgent: null }) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));

const tx = {
  $queryRaw: jest.fn(async () => []),
  userSurpriseBox: {
    count: jest.fn(async () => 0),
    aggregate: jest.fn(async () => ({ _sum: { points: 0 } })),
    createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  },
  notification: { createMany: jest.fn(async () => ({ count: 1 })) },
  auditLog: { create: jest.fn(async () => ({ id: 'a1' })) },
};
const mockUserFindFirst = jest.fn();
const mockQueryRaw = jest.fn();
const mockAggregate = jest.fn(async () => ({ _sum: { points: 0 } }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => mockUserFindFirst(...a) },
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    userSurpriseBox: { aggregate: (...a: unknown[]) => mockAggregate(...(a as [])) },
    $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
  },
}));

const customer = { id: 'c1', name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null, fraudStatus: 'clean' };

async function send(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/admin/surprise-box/send/route');
  const req = new NextRequest('http://localhost/api/admin/surprise-box/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindFirst.mockResolvedValue(customer);
  mockQueryRaw.mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ id: `c${i}` })));
  mockAggregate.mockResolvedValue({ _sum: { points: 0 } });
  tx.userSurpriseBox.aggregate.mockResolvedValue({ _sum: { points: 0 } });
  tx.userSurpriseBox.count.mockResolvedValue(0);
});

describe('tavanlar', () => {
  it('kutu başına 5.000 üstü puan reddedilir (eskiden sınırsızdı)', async () => {
    const r = await send({ title: 'Hediye', points: 1_000_000, email: 'ayse@ornek.com' });
    expect(r.status).toBe(400);
    expect(tx.userSurpriseBox.createMany).not.toHaveBeenCalled();
  });

  it('500 alıcı × 5.000 puan = 2,5M → kampanya tavanı (100.000) aşılır, hiçbir şey yazılmaz', async () => {
    const r = await send({ title: 'Hediye', points: 5_000, randomCount: 500, confirm: { recipientCount: 500, totalPoints: 2_500_000 } });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CAMPAIGN_CAP_EXCEEDED');
    expect(tx.userSurpriseBox.createMany).not.toHaveBeenCalled();
  });

  it('günlük gönderen bütçesi aşılırsa 422 DAILY_BUDGET_EXCEEDED', async () => {
    mockAggregate.mockResolvedValue({ _sum: { points: 249_000 } });
    const r = await send({ title: 'Hediye', points: 2_000, email: 'ayse@ornek.com', confirm: { recipientCount: 1, totalPoints: 2_000 } });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('DAILY_BUDGET_EXCEEDED');
  });
});

describe('hedef kuralları', () => {
  it('rastgele seçim veritabanında ORDER BY random() + gölge ban/askı hariç', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    await send({ title: 'Hediye', points: 0, randomCount: 2, dryRun: true });
    const sql = (mockQueryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toMatch(/ORDER BY random\(\)/);
    expect(sql).toMatch(/"fraudStatus" <> 'shadow_ban'/);
    expect(sql).toMatch(/"suspendedAt" IS NULL/);
  });

  it('müşteri olmayan hedef 400, gölge banlı hedef 409', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ ...customer, role: 'DEALER' });
    expect((await send({ title: 'Hediye', email: 'b@x.com' })).status).toBe(400);
    mockUserFindFirst.mockResolvedValueOnce({ ...customer, fraudStatus: 'shadow_ban' });
    expect((await send({ title: 'Hediye', email: 'b@x.com' })).status).toBe(409);
  });
});

describe('iki adımlı onay + audit', () => {
  it('dryRun yazmaz; maskelenmiş alıcı ve toplamları döner', async () => {
    const r = await send({ title: 'Hediye', points: 300, email: 'AYSE@ornek.com', dryRun: true });
    expect(r.status).toBe(200);
    expect(r.body.preview).toMatchObject({ recipientCount: 1, pointsPerBox: 300, totalPoints: 300 });
    expect(r.body.preview.recipient.name).toBe('Ayşe Y.');
    expect(r.body.preview.recipient.email).not.toContain('ayse@');
    expect(tx.userSurpriseBox.createMany).not.toHaveBeenCalled();
  });

  it('puanlı gönderim onaysız 409 CONFIRMATION_REQUIRED', async () => {
    const r = await send({ title: 'Hediye', points: 300, email: 'ayse@ornek.com' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONFIRMATION_REQUIRED');
    expect(tx.userSurpriseBox.createMany).not.toHaveBeenCalled();
  });

  it('onaylı gönderim: kilit + kutu + bildirim + AuditLog aynı transaction’da', async () => {
    const r = await send({
      title: 'Hediye',
      points: 300,
      email: 'ayse@ornek.com',
      confirm: { recipientCount: 1, totalPoints: 300 },
      requestId: 'camp_12345678',
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ count: 1, totalPoints: 300, campaignId: 'camp_12345678', duplicate: false });
    expect(tx.$queryRaw).toHaveBeenCalled(); // pg_advisory_xact_lock
    expect(tx.userSurpriseBox.createMany).toHaveBeenCalledTimes(1);
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(audit[0].data).toMatchObject({ action: 'SURPRISE_BOX_SEND', entityId: 'camp_12345678' });
    expect((audit[0].data.newData as Record<string, unknown>).totalPoints).toBe(300);
  });

  it('aynı requestId ile tekrar gönderim yeni kutu üretmez', async () => {
    tx.userSurpriseBox.count.mockResolvedValueOnce(1);
    const r = await send({
      title: 'Hediye',
      points: 300,
      email: 'ayse@ornek.com',
      confirm: { recipientCount: 1, totalPoints: 300 },
      requestId: 'camp_12345678',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.duplicate).toBe(true);
    expect(tx.userSurpriseBox.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
