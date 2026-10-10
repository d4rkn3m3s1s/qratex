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

/** Kullanıcı tercih tablosu: id → notificationPrefs. */
const users: Record<string, { role: string; prefs: unknown }> = {};
const createdNotifications: Array<{ userId: string; data: Record<string, unknown> }> = [];

const mockCampaignFindUnique = jest.fn();
const mockCampaignUpdateMany = jest.fn();
const mockProposalFindUnique = jest.fn();
const mockProposalUpdateMany = jest.fn();
const mockFeedbackFindMany = jest.fn();
const mockConsumptionFindMany = jest.fn();

const notificationApi = {
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

describe('kampanya gönderimi (/api/dealer/campaigns/[id]/send)', () => {
  const campaign = {
    id: 'c1',
    dealerId: 'dealer-1',
    status: 'draft',
    channel: 'notification',
    targetSegment: 'all',
    title: 'İndirim',
    message: 'Bugün %10',
  };

  it('kampanyayı kapatan müşteriye ne bildirim ne push gider; diğer kanallar tercihe göre ayrışır', async () => {
    mockCampaignFindUnique.mockResolvedValue(campaign);
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(req('/api/dealer/campaigns/c1/send'), params('c1'));
    expect(res.status).toBe(200);
    expect(recipients()).toEqual(['fresh', 'pushOff']);
    expect(pushed()).toEqual(['fresh']);
    expect(createdNotifications.every((n) => n.data.kind === 'campaign')).toBe(true);
    const body = await res.json();
    expect(body).toMatchObject({ sentCount: 2, optedOutCount: 1, candidateCount: 3 });
    // "gönderildi" işareti ve bildirimler aynı transaction'da
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('herkes kapatmışsa hiçbir şey gönderilmez ve kampanya "gönderildi" işaretlenmez', async () => {
    users.pushOff.prefs = OPTED_OUT;
    users.fresh.prefs = OPTED_OUT;
    mockCampaignFindUnique.mockResolvedValue(campaign);
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(req('/api/dealer/campaigns/c1/send'), params('c1'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NO_CONSENTING_RECIPIENTS');
    expect(createdNotifications).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockCampaignUpdateMany).not.toHaveBeenCalled();
  });

  it('sahte "email" kanallı (eski) kampanya gönderilmez', async () => {
    mockCampaignFindUnique.mockResolvedValue({ ...campaign, channel: 'email' });
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(req('/api/dealer/campaigns/c1/send'), params('c1'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CHANNEL_UNSUPPORTED');
    expect(createdNotifications).toHaveLength(0);
  });

  it('FAIL-CLOSED: tercih okunamazsa gönderim yapılmaz', async () => {
    mockCampaignFindUnique.mockResolvedValue(campaign);
    prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(req('/api/dealer/campaigns/c1/send'), params('c1'));
    expect(res.status).toBe(500);
    expect(createdNotifications).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('oluşturma/düzenleme şeması "email" kanalını Türkçe hatayla reddeder', async () => {
    const { campaignCreateSchema, campaignUpdateSchema } = await import('@/app/api/dealer/campaigns/campaign-schema');
    const r = campaignCreateSchema.safeParse({ title: 'a', message: 'b', targetSegment: 'all', channel: 'email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toMatch(/E-posta kanalı/);
    expect(campaignUpdateSchema.safeParse({ channel: 'email' }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ title: 'a', message: 'b', targetSegment: 'all' }).success).toBe(true);
  });
});

describe('risk segmenti (/api/dealer/campaigns/risk-segment)', () => {
  it('tercihi kapatanı atlar; push yalnız push\'u açık olana; data.kind kampanya grubunda', async () => {
    const { POST } = await import('@/app/api/dealer/campaigns/risk-segment/route');
    const res = await POST(req('/api/dealer/campaigns/risk-segment', {}));
    expect(res.status).toBe(200);
    expect(recipients()).toEqual(['fresh', 'pushOff']);
    expect(pushed()).toEqual(['fresh']);
    expect(createdNotifications.every((n) => n.data.kind === 'campaign-risk-segment')).toBe(true);
    expect(await res.json()).toMatchObject({ sent: 2, eligibleCount: 3, optedOutCount: 1 });
  });
});

describe('win-back (/api/dealer/win-back)', () => {
  it('tercihi kapatan müşteriye "Sizi Özledik" gitmez; gerçek gönderim sayısı döner', async () => {
    const { POST } = await import('@/app/api/dealer/win-back/route');
    const res = await POST(
      req('/api/dealer/win-back', { userIds: ['optedOut', 'pushOff', 'fresh'], offerType: 'free_coffee' })
    );
    expect(res.status).toBe(200);
    // win-back yalnız uygulama içi kanaldan gider: pushOff'un uygulama içi kanalı açık.
    expect(recipients()).toEqual(['fresh', 'pushOff']);
    expect(createdNotifications.every((n) => n.data.kind === 'campaign-win-back')).toBe(true);
    const body = await res.json();
    expect(body).toMatchObject({ sent: 2, skippedByPreference: 1 });
  });
});

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
