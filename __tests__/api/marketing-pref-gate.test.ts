/**
 * P0-35 / bayi F4-F11: pazarlama gönderimleri müşterinin "Kampanya & Sürprizler" bildirim
 * tercihine saygı göstermeli. YENİDEN ÜRETİM: müşteri Ayarlar → "Kampanya & Sürprizler"
 * (uygulama içi + push) kapatır → bayi kampanya / win-back / risk segmenti / segment önerisi
 * gönderir → eskiden müşterinin zilinde kayıt oluşuyor ve cihazına push düşüyordu.
 * Gerçek route handler'ları çağrılır; prisma, oturum ve push mock'lanır (gerçek DB yok).
 */
import { NextRequest } from 'next/server';

const DEALER = { user: { id: 'dealer-1', role: 'DEALER', name: 'Kafe' } };

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn(async () => DEALER) }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn(async () => DEALER) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: DEALER })),
  requireDealerResource: jest.fn(() => null),
}));
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: jest.fn(async () => null),
  assertMenuItemVisible: jest.fn(async () => null),
}));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn(async () => ({ features: { segmentProposals: true } })),
}));
const mockSegmentUsers = jest.fn();
jest.mock('@/lib/innovation-segment-users', () => ({
  resolveInnovationSegmentUserIds: (...a: unknown[]) => mockSegmentUsers(...a),
}));
const mockPush = jest.fn();
jest.mock('@/lib/push', () => ({ sendPushNotification: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));

/** Kullanıcı tercih tablosu: id → notificationPrefs. */
const users: Record<string, { role: string; prefs: unknown }> = {};
const createdNotifications: Array<{ userId: string; data: Record<string, unknown> }> = [];

const mockCampaignFindUnique = jest.fn();
const mockCampaignUpdateMany = jest.fn();
const mockProposalFindUnique = jest.fn();
const mockProposalUpdateMany = jest.fn();
const mockFeedbackFindMany = jest.fn();
const mockConsumptionFindMany = jest.fn();

/** Sıklık tavanı: son 7 günde bu işletmeden alınmış pazarlama bildirimleri (userId listesi). */
const recentMarketing: string[] = [];
const notificationApi = {
  findMany: jest.fn(async () => recentMarketing.map((userId, i) => ({ id: `n${i}`, userId, data: { dealerId: 'dealer-1' } }))),
  createMany: jest.fn(async ({ data }: { data: Array<{ userId: string; data: Record<string, unknown> }> }) => {
    createdNotifications.push(...data);
    return { count: data.length };
  }),
  create: jest.fn(async ({ data }: { data: { userId: string; data: Record<string, unknown> } }) => {
    createdNotifications.push(data);
    return data;
  }),
};
const prismaMock = {
  user: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in
        .filter((id) => users[id])
        .map((id) => ({ id, role: users[id].role, anonymizedAt: null, notificationPrefs: users[id].prefs }))
    ),
  },
  campaign: {
    findUnique: (...a: unknown[]) => mockCampaignFindUnique(...a),
    updateMany: (...a: unknown[]) => mockCampaignUpdateMany(...a),
    // Sıklık tavanı sayacı: son 7 günde gönderilmiş kampanya yok.
    findMany: jest.fn(async () => []),
  },
  segmentCampaignProposal: {
    findUnique: (...a: unknown[]) => mockProposalFindUnique(...a),
    updateMany: (...a: unknown[]) => mockProposalUpdateMany(...a),
  },
  feedback: {
    findMany: (...a: unknown[]) => mockFeedbackFindMany(...a),
    groupBy: jest.fn(async () => []),
  },
  consumption: { findMany: (...a: unknown[]) => mockConsumptionFindMany(...a) },
  notification: notificationApi,
  analyticsEvent: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, isPrismaConnectivityError: () => false }));

const OPTED_OUT = { campaign: { app: false, push: false } };
const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const recipients = () => createdNotifications.map((n) => n.userId).sort();
const pushed = () => mockPush.mock.calls.map((c) => c[0]).sort();

beforeEach(() => {
  jest.clearAllMocks();
  createdNotifications.length = 0;
  recentMarketing.length = 0;
  for (const k of Object.keys(users)) delete users[k];
  users.optedOut = { role: 'CUSTOMER', prefs: OPTED_OUT };
  users.pushOff = { role: 'CUSTOMER', prefs: { campaign: { push: false } } };
  users.fresh = { role: 'CUSTOMER', prefs: null };
  mockPush.mockResolvedValue(true);
  mockFeedbackFindMany.mockImplementation(async () => [
    { id: 'f1', userId: 'optedOut' },
    { id: 'f2', userId: 'pushOff' },
    { id: 'f3', userId: 'fresh' },
  ]);
  mockCampaignUpdateMany.mockResolvedValue({ count: 1 });
  mockProposalUpdateMany.mockResolvedValue({ count: 1 });
  mockConsumptionFindMany.mockImplementation(async ({ where }: { where: { customerId: { in: string[] } } }) =>
    where.customerId.in.map((customerId) => ({ customerId }))
  );
});

// Kampanya gönderimi (Kampanya merkezi — Dalga 2) kendi test dosyasında: tercih (fail-closed),
// sahte e-posta kanalı, frekans tavanı, kontrol grubu, tek transaction ve şema →
// `__tests__/dealer/b-kampanyalar/send-route.test.ts` + `domain.test.ts`.

// Risk segmenti ve win-back uçları emekli edildi (Müşteriler 360 — Dalga 2): segment / geri
// kazanım gönderimleri artık `POST /api/dealer/customers/actions` üzerinden; tercih + sıklık
// tavanı testi `__tests__/dealer/b-musteriler/actions.test.ts` içinde.

describe('segment önerisi gönderimi (/api/dealer/innovation/segment-proposals/[id]/send)', () => {
  it('tercihe saygı + SENT işareti ile bildirimler aynı transaction\'da', async () => {
    mockProposalFindUnique.mockResolvedValue({
      id: 'p1',
      dealerId: 'dealer-1',
      status: 'APPROVED',
      segmentKey: 'loyal',
      title: 'Sadık müşterilere',
      message: 'Teşekkürler',
    });
    mockSegmentUsers.mockResolvedValue(['optedOut', 'pushOff', 'fresh']);
    const { POST } = await import('@/app/api/dealer/innovation/segment-proposals/[id]/send/route');
    const res = await POST(req('/api/dealer/innovation/segment-proposals/p1/send'), params('p1'));
    expect(res.status).toBe(200);
    expect(recipients()).toEqual(['fresh', 'pushOff']);
    expect(pushed()).toEqual(['fresh']);
    expect(createdNotifications.every((n) => n.data.kind === 'campaign-segment-proposal')).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ sentCount: 2, optedOutCount: 1 });
  });

  it('sıklık tavanı: son 7 günde 2 pazarlama iletisi almış müşteri atlanır; herkes tavandaysa SENT yapılmaz', async () => {
    mockProposalFindUnique.mockResolvedValue({
      id: 'p1', dealerId: 'dealer-1', status: 'APPROVED', segmentKey: 'loyal', title: 'T', message: 'M',
    });
    mockSegmentUsers.mockResolvedValue(['pushOff', 'fresh']);
    recentMarketing.push('fresh', 'fresh');
    const { POST } = await import('@/app/api/dealer/innovation/segment-proposals/[id]/send/route');
    const res = await POST(req('/api/dealer/innovation/segment-proposals/p1/send'), params('p1'));
    expect(res.status).toBe(200);
    expect(recipients()).toEqual(['pushOff']);
    expect(pushed()).toEqual([]);
    expect(await res.json()).toMatchObject({ sentCount: 1, frequencyCappedCount: 1 });

    jest.clearAllMocks();
    createdNotifications.length = 0;
    recentMarketing.push('pushOff', 'pushOff');
    const res2 = await POST(req('/api/dealer/innovation/segment-proposals/p1/send'), params('p1'));
    expect(res2.status).toBe(400);
    expect((await res2.json()).code).toBe('FREQUENCY_CAPPED');
    expect(mockProposalUpdateMany).not.toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(0);
  });

  it('herkes kapatmışsa taslak SENT yapılmaz', async () => {
    mockProposalFindUnique.mockResolvedValue({
      id: 'p1', dealerId: 'dealer-1', status: 'APPROVED', segmentKey: 'loyal', title: 'T', message: 'M',
    });
    mockSegmentUsers.mockResolvedValue(['optedOut']);
    const { POST } = await import('@/app/api/dealer/innovation/segment-proposals/[id]/send/route');
    const res = await POST(req('/api/dealer/innovation/segment-proposals/p1/send'), params('p1'));
    expect(res.status).toBe(400);
    expect(mockProposalUpdateMany).not.toHaveBeenCalled();
    expect(createdNotifications).toHaveLength(0);
  });
});
