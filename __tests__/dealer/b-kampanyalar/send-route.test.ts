/**
 * Kampanya merkezi uçları — gerçek route handler'ları, prisma/oturum/push mock (gerçek DB yok).
 *
 * Denetim bulguları (docs/audit/2026-10-08/bayi/dealer_campaigns.md, ..._id_performance.md):
 *  B1  müşterinin "Kampanya & Sürprizler" tercihi (kanal bazlı, fail-closed) — E3 filtresi
 *  B2  sahte e-posta kanalı gönderilmez
 *  B3  kitle bayi-yerel tek kaynaktan
 *  B4  durum kilidi + bildirimler + alıcı kaydı TEK transaction
 *  B6  modül/menü kapısı her uçta; yabancı kampanya 404
 *  P1-4 performans: kesin alıcı listesi, gönderim tarihine bağlı pencere, kontrol grubu
 *  + planlı gönderim (gün hassasiyeti) ve günlük gönderim işi, push açılma izleme.
 */
import { NextRequest } from 'next/server';

const DEALER = { user: { id: 'dealer-1', role: 'DEALER', name: 'Kafe', email: 'kafe@example.com' } };
const mockRequireAuth = jest.fn(async (_roles?: unknown) => ({ session: DEALER }) as unknown);
jest.mock('@/lib/api-auth', () => ({ requireAuth: (roles: unknown) => mockRequireAuth(roles) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const gate = { module: false, menu: false };
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: jest.fn(async () => (gate.module ? new Response('{}', { status: 403 }) : null)),
  assertMenuItemVisible: jest.fn(async () => (gate.menu ? new Response('{}', { status: 403 }) : null)),
}));
const mockPush = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/lib/push', () => ({ sendPushNotification: (...a: unknown[]) => mockPush(...a) }));

type Row = Record<string, unknown>;
const db = {
  campaigns: [] as Row[],
  users: {} as Record<string, { role: string; prefs: unknown; anonymizedAt?: Date | null }>,
  feedbackUsers: [] as Array<{ userId: string; first: Date; last: Date; churn: number | null }>,
  notifications: [] as Row[],
  audit: [] as Row[],
  analytics: [] as Row[],
  consumptions: [] as Row[],
  feedbacks: [] as Row[],
  failUsers: false,
};

function inFilter(value: unknown, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c) return value !== c.not;
    let ok = true;
    if ('gte' in c) ok = ok && value instanceof Date && value.getTime() >= (c.gte as Date).getTime();
    if ('lte' in c) ok = ok && value instanceof Date && value.getTime() <= (c.lte as Date).getTime();
    if ('lt' in c) ok = ok && value instanceof Date && value.getTime() < (c.lt as Date).getTime();
    return ok;
  }
  return value === cond;
}
function jsonPath(data: unknown, cond: unknown): boolean {
  if (!cond) return true;
  const c = cond as { path: string[]; equals: unknown };
  return ((data ?? {}) as Row)[c.path[0]] === c.equals;
}

const prismaMock: Record<string, unknown> = {
  campaign: {
    findFirst: jest.fn(async ({ where }: { where: Row }) => db.campaigns.find((c) => c.id === where.id && (!where.dealerId || c.dealerId === where.dealerId)) ?? null),
    findUnique: jest.fn(async ({ where }: { where: Row }) => db.campaigns.find((c) => c.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      db.campaigns.filter((c) => inFilter(c.dealerId, where.dealerId) && inFilter(c.status, where.status) && (where.sentAt ? c.sentAt != null && inFilter(c.sentAt, where.sentAt) : true))
    ),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hits = db.campaigns.filter((c) => c.id === where.id && inFilter(c.dealerId, where.dealerId) && inFilter(c.status, where.status));
      for (const h of hits) Object.assign(h, data);
      return { count: hits.length };
    }),
  },
  user: {
    findUnique: jest.fn(async ({ where }: { where: Row }) => (where.id === 'dealer-1' ? { role: 'DEALER' } : null)),
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      if (db.failUsers) throw new Error('db down');
      return where.id.in
        .filter((id) => db.users[id])
        .map((id) => ({ id, role: db.users[id].role, anonymizedAt: db.users[id].anonymizedAt ?? null, notificationPrefs: db.users[id].prefs }));
    }),
  },
  consumption: {
    groupBy: jest.fn(async () => []),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      db.consumptions.filter((r) => inFilter(r.customerId, where.customerId) && inFilter(r.createdAt, where.createdAt))
    ),
  },
  consumptionReview: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) },
  feedback: {
    groupBy: jest.fn(async (args: Row) =>
      args._min
        ? db.feedbackUsers.map((f) => ({ userId: f.userId, _min: { createdAt: f.first }, _max: { createdAt: f.last }, _avg: { churnRisk: f.churn } }))
        : []
    ),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      db.feedbacks.filter((r) => inFilter(r.userId, where.userId) && inFilter(r.createdAt, where.createdAt))
    ),
  },
  notification: {
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) db.notifications.push({ ...d, id: `n${db.notifications.length}`, createdAt: new Date(), readAt: null });
      return { count: data.length };
    }),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { ...data, id: `n${db.notifications.length}`, createdAt: new Date(), readAt: null };
      db.notifications.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      db.notifications.filter(
        (n) =>
          inFilter(n.userId, where.userId) &&
          inFilter(n.type, where.type) &&
          inFilter(n.createdAt, where.createdAt) &&
          jsonPath(n.data, where.data) &&
          (where.readAt ? n.readAt != null : true)
      )
    ),
  },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Row }) => {
      db.audit.push({ ...data, createdAt: new Date(Date.now() + db.audit.length) });
      return data;
    }),
    findMany: jest.fn(async ({ where }: { where: Row }) =>
      db.audit
        .filter((a) => inFilter(a.entity, where.entity) && inFilter(a.entityId, where.entityId) && inFilter(a.action, where.action))
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
    ),
    findFirst: jest.fn(async ({ where }: { where: Row }) =>
      db.audit
        .filter((a) => inFilter(a.entity, where.entity) && inFilter(a.entityId, where.entityId) && inFilter(a.action, where.action))
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0] ?? null
    ),
  },
  analyticsEvent: {
    findMany: jest.fn(async ({ where }: { where: Row }) => db.analytics.filter((e) => e.event === where.event && jsonPath(e.data, where.data))),
    findFirst: jest.fn(async ({ where }: { where: Row }) => db.analytics.find((e) => e.userId === where.userId && e.event === where.event && jsonPath(e.data, where.data)) ?? null),
    create: jest.fn(async ({ data }: { data: Row }) => {
      db.analytics.push(data);
      return data;
    }),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock, isPrismaConnectivityError: () => false }));

const OPTED_OUT = { campaign: { app: false, push: false } };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const campaignNotifs = () => db.notifications.filter((n) => n.type === 'campaign');

function seedCampaign(over: Row = {}): Row {
  const c = {
    id: 'c1',
    dealerId: 'dealer-1',
    title: 'İndirim',
    message: 'Bugün tatlılar bizden',
    targetSegment: 'all',
    channel: 'notification',
    status: 'draft',
    playbookSourceId: null,
    sentAt: null,
    sentCount: 0,
    createdAt: new Date('2026-10-01T08:00:00Z'),
    updatedAt: new Date('2026-10-01T08:00:00Z'),
    ...over,
  };
  db.campaigns.push(c);
  return c;
}

beforeEach(() => {
  jest.clearAllMocks();
  gate.module = false;
  gate.menu = false;
  db.campaigns = [];
  db.notifications = [];
  db.audit = [];
  db.analytics = [];
  db.consumptions = [];
  db.feedbacks = [];
  db.failUsers = false;
  db.users = {
    optedOut: { role: 'CUSTOMER', prefs: OPTED_OUT },
    pushOff: { role: 'CUSTOMER', prefs: { campaign: { push: false } } },
    fresh: { role: 'CUSTOMER', prefs: null },
    gone: { role: 'CUSTOMER', prefs: null, anonymizedAt: new Date() },
  };
  const now = Date.now();
  db.feedbackUsers = ['fresh', 'pushOff', 'optedOut', 'gone'].map((userId, i) => ({
    userId,
    first: new Date(now - (60 + i) * 86_400_000),
    last: new Date(now - (i + 1) * 86_400_000),
    churn: null,
  }));
  mockRequireAuth.mockImplementation(async () => ({ session: DEALER }));
  mockPush.mockResolvedValue(true);
});

describe('POST /api/dealer/campaigns/:id/send', () => {
  it('E3: tercihi kapatana ne bildirim ne push; kanallar ayrı; tek transaction; alıcı kaydı', async () => {
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send', { holdoutPct: 0 }), params('c1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ recipientCount: 2, inAppCount: 2, pushAttempted: 1, pushDelivered: 1, optedOutCount: 1, ineligibleCount: 1 });

    expect(campaignNotifs().map((n) => n.userId).sort()).toEqual(['fresh', 'pushOff']);
    expect(campaignNotifs().every((n) => (n.data as Row).kind === 'campaign' && (n.data as Row).campaignId === 'c1' && (n.data as Row).dealerId === 'dealer-1')).toBe(true);
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(['fresh']);
    expect(mockPush.mock.calls[0][3]).toBe('/api/campaigns/c1/open');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    const snap = db.audit.find((a) => a.action === 'campaign.send')!.newData as Row;
    expect(snap).toMatchObject({ v: 1, campaignId: 'c1', recipients: ['fresh', 'pushOff'], push: ['fresh'], holdout: [], trigger: 'manual' });
    expect(db.campaigns[0]).toMatchObject({ status: 'sent', sentCount: 2 });
    expect(db.audit.find((a) => a.action === 'campaign.push_result')!.newData).toEqual({ attempted: 1, delivered: 1 });
  });

  it('herkes kapatmışsa 409 NO_RECIPIENTS; hiçbir şey yazılmaz, kampanya taslak kalır', async () => {
    db.users.pushOff.prefs = OPTED_OUT;
    db.users.fresh.prefs = OPTED_OUT;
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NO_RECIPIENTS');
    expect(db.notifications).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
    expect(db.campaigns[0].status).toBe('draft');
  });

  it('frekans tavanı: 7 günde 2 ileti almış müşteri atlanır', async () => {
    for (const cid of ['old1', 'old2']) {
      db.notifications.push({ id: cid, userId: 'fresh', type: 'campaign', createdAt: new Date(), readAt: null, data: { kind: 'campaign', campaignId: cid, dealerId: 'dealer-1' } });
    }
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ recipientCount: 1, frequencyCappedCount: 1 });
    expect(campaignNotifs().filter((n) => (n.data as Row).campaignId === 'c1').map((n) => n.userId)).toEqual(['pushOff']);
  });

  it('sahte "email" kanallı eski kampanya gönderilmez', async () => {
    seedCampaign({ channel: 'email' });
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CHANNEL_UNSUPPORTED');
    expect(db.notifications).toHaveLength(0);
  });

  it('FAIL-CLOSED: tercih okunamazsa gönderim yok', async () => {
    db.failUsers = true;
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(res.status).toBe(500);
    expect(db.notifications).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
    expect(db.campaigns[0].status).toBe('draft');
  });

  it('yabancı kampanya → 404; gönderilmiş → 409; modül kapalı → 403', async () => {
    seedCampaign({ dealerId: 'dealer-2' });
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    expect((await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'))).status).toBe(404);

    db.campaigns = [];
    seedCampaign({ status: 'sent', sentAt: new Date() });
    const sent = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(sent.status).toBe(409);
    expect((await sent.json()).code).toBe('NOT_SENDABLE');

    gate.menu = true;
    const blocked = await POST(post('/api/dealer/campaigns/c1/send', {}), params('c1'));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('MODULE_DISABLED');
  });

  it('ADMIN bayi adına gönderemez (salt-okunur)', async () => {
    mockRequireAuth.mockImplementation(async () => ({ session: { user: { id: 'admin-1', role: 'ADMIN' } } }));
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/send/route');
    const res = await POST(post('/api/dealer/campaigns/c1/send?dealerId=dealer-1', {}), params('c1'));
    expect(res.status).toBe(403);
    expect(db.notifications).toHaveLength(0);
    // Okuma serbest (salt-okunur görünüm).
    const { GET } = await import('@/app/api/dealer/campaigns/[id]/performance/route');
    expect((await GET(get('/api/dealer/campaigns/c1/performance?dealerId=dealer-1'), params('c1'))).status).toBe(200);
  });
});

describe('şema', () => {
  it('"email" kanalı Türkçe hatayla reddedilir; kitle enum tek kaynaktan', async () => {
    const { campaignCreateSchema, campaignUpdateSchema } = await import('@/app/api/dealer/campaigns/campaign-schema');
    const r = campaignCreateSchema.safeParse({ title: 'a', message: 'b', targetSegment: 'all', channel: 'email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toMatch(/E-posta kanalı/);
    expect(campaignUpdateSchema.safeParse({ channel: 'email' }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ title: 'a', message: 'b', targetSegment: 'dormant' }).success).toBe(true);
    expect(campaignCreateSchema.safeParse({ title: 'a', message: 'b', targetSegment: 'weird' }).success).toBe(false);
  });
});

describe('planlı gönderim', () => {
  it('bugün reddedilir; geçerli gün İstanbul gece yarısına planlanır ve kontrol oranı kaydedilir', async () => {
    seedCampaign();
    const { POST } = await import('@/app/api/dealer/campaigns/[id]/schedule/route');
    const { istanbulDay, addDays, istanbulDayStart } = await import('@/components/ds/page/date-range');
    const today = istanbulDay();
    const bad = await POST(post('/api/dealer/campaigns/c1/schedule', { day: today, holdoutPct: 0 }), params('c1'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('SCHEDULE_INVALID');

    const day = addDays(today, 3);
    const ok = await POST(post('/api/dealer/campaigns/c1/schedule', { day, holdoutPct: 10 }), params('c1'));
    expect(ok.status).toBe(200);
    expect(db.campaigns[0].status).toBe('scheduled');
    expect((db.campaigns[0].sentAt as Date).toISOString()).toBe(istanbulDayStart(day).toISOString());
    expect(db.audit.find((a) => a.action === 'campaign.schedule')!.newData).toMatchObject({ day, holdoutPct: 10 });
    expect(db.notifications).toHaveLength(0);
  });

  it('günlük iş: günü gelen gönderilir; kitlesi boş olan "failed" + bayiye işletim bildirimi', async () => {
    seedCampaign({ id: 'due', status: 'scheduled', sentAt: new Date(Date.now() - 60_000) });
    seedCampaign({ id: 'empty', status: 'scheduled', sentAt: new Date(Date.now() - 60_000), targetSegment: 'vip' });
    seedCampaign({ id: 'later', status: 'scheduled', sentAt: new Date(Date.now() + 86_400_000) });
    const { dispatchDueCampaigns } = await import('@/components/dealer/b-kampanyalar/server/schedule');
    const { kindToGroup } = await import('@/lib/notification-prefs');
    const summary = await dispatchDueCampaigns();
    expect(summary).toMatchObject({ due: 2, sent: 1, failed: 1, errored: 0 });
    expect(db.campaigns.find((c) => c.id === 'due')).toMatchObject({ status: 'sent' });
    expect(db.campaigns.find((c) => c.id === 'empty')).toMatchObject({ status: 'failed' });
    expect(db.campaigns.find((c) => c.id === 'later')).toMatchObject({ status: 'scheduled' });
    expect((db.audit.find((a) => a.entityId === 'due' && a.action === 'campaign.send')!.newData as Row).trigger).toBe('schedule');
    const dealerNotes = db.notifications.filter((n) => n.userId === 'dealer-1');
    expect(dealerNotes).toHaveLength(2);
    // İşletim bildirimi pazarlama tercih grubuna düşmez (susturulamaz değil, pazarlama değil).
    for (const n of dealerNotes) expect(kindToGroup((n.data as Row).kind as string)).toBeNull();
  });

  it('günlük iş (güvenlik): askıya alınmış bayi ya da kapalı modül → gönderim YOK (deny-by-default)', async () => {
    seedCampaign({ id: 'due', status: 'scheduled', sentAt: new Date(Date.now() - 60_000) });
    const { dispatchDueCampaigns } = await import('@/components/dealer/b-kampanyalar/server/schedule');
    (prismaMock.user.findUnique as jest.Mock).mockImplementationOnce(async () => ({ role: 'DEALER', suspendedAt: new Date() }));
    expect(await dispatchDueCampaigns()).toMatchObject({ due: 1, sent: 0, failed: 1 });
    expect(mockPush).not.toHaveBeenCalled();

    seedCampaign({ id: 'due2', status: 'scheduled', sentAt: new Date(Date.now() - 60_000) });
    gate.module = true;
    try {
      expect(await dispatchDueCampaigns()).toMatchObject({ due: 1, sent: 0, failed: 1 });
    } finally {
      gate.module = false;
    }
    // Yetki kontrolü hata verirse de gönderilmez (planlı kalır).
    seedCampaign({ id: 'due3', status: 'scheduled', sentAt: new Date(Date.now() - 60_000) });
    (prismaMock.user.findUnique as jest.Mock).mockImplementationOnce(async () => { throw new Error('db down'); });
    expect(await dispatchDueCampaigns()).toMatchObject({ due: 1, sent: 0, errored: 1 });
    expect(db.campaigns.find((c) => c.id === 'due3')).toMatchObject({ status: 'scheduled' });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('GET /api/dealer/campaigns/:id/performance', () => {
  it('kesin alıcı listesi + kontrol grubu ile huni ve artış; pencere gönderim tarihine bağlı', async () => {
    const sentAt = new Date(Date.now() - 20 * 86_400_000);
    const day = 86_400_000;
    seedCampaign({ status: 'sent', sentAt, sentCount: 3 });
    db.audit.push({
      action: 'campaign.send',
      entity: 'Campaign',
      entityId: 'c1',
      createdAt: sentAt,
      newData: {
        v: 1, campaignId: 'c1', dealerId: 'dealer-1', segment: 'all', sentAt: sentAt.toISOString(), trigger: 'manual',
        recipients: ['r1', 'r2', 'r3'], inApp: ['r1', 'r2'], push: ['r3'], holdout: ['h1', 'h2'], holdoutPct: 10,
        candidateCount: 6, ineligibleCount: 0, optedOutCount: 1, frequencyCappedCount: 0, truncatedCount: 0,
      },
    });
    db.notifications.push(
      { id: 'n1', userId: 'r1', type: 'campaign', createdAt: sentAt, readAt: new Date(sentAt.getTime() + 3600_000), data: { kind: 'campaign', campaignId: 'c1' } },
      { id: 'n2', userId: 'r2', type: 'campaign', createdAt: sentAt, readAt: null, data: { kind: 'campaign', campaignId: 'c1' } }
    );
    db.analytics.push({ userId: 'r3', event: 'campaign_push_open', data: { campaignId: 'c1' } }, { userId: 'stranger', event: 'campaign_push_open', data: { campaignId: 'c1' } });
    db.consumptions.push(
      { customerId: 'r1', amount: 300, createdAt: new Date(sentAt.getTime() + 2 * day) },
      { customerId: 'r2', amount: null, createdAt: new Date(sentAt.getTime() + 20 * day) }, // pencere (14g) dışında
      { customerId: 'r2', amount: 50, createdAt: new Date(sentAt.getTime() - 3 * day) }, // önce
      { customerId: 'h1', amount: 80, createdAt: new Date(sentAt.getTime() + day) }
    );
    db.feedbacks.push({ userId: 'r3', rating: 5, createdAt: new Date(sentAt.getTime() + 5 * day) });

    const { GET } = await import('@/app/api/dealer/campaigns/[id]/performance/route');
    const res = await GET(get('/api/dealer/campaigns/c1/performance?window=14'), params('c1'));
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.state).toBe('ready');
    expect(d.windowComplete).toBe(true);
    expect(d.funnel).toEqual([
      { key: 'sent', count: 3, rate: 100 },
      { key: 'opened', count: 2, rate: 66.7 },
      { key: 'visited', count: 2, rate: 66.7 },
      { key: 'spent', count: 1, rate: 33.3 },
    ]);
    expect(d.after).toMatchObject({ size: 3, visitors: 2, spend: 300, avgRating: 5 });
    expect(d.before).toMatchObject({ visitors: 1, spend: 50 });
    expect(d.control).toMatchObject({ size: 2, visitors: 1, pct: 10 });
    expect(d.liftPoints).toBe(16.7);
    expect(d.delivery).toMatchObject({ source: 'snapshot', reach: 3, inAppDelivered: 2, pushAttempted: 1 });
    expect(d.timeline.find((p: Row) => p.offset === 2)).toMatchObject({ visitors: 1, spend: 300 });
  });

  it('taslak → not-sent; yabancı kampanya → 404', async () => {
    seedCampaign();
    seedCampaign({ id: 'x', dealerId: 'dealer-2' });
    const { GET } = await import('@/app/api/dealer/campaigns/[id]/performance/route');
    const draft = await GET(get('/api/dealer/campaigns/c1/performance'), params('c1'));
    expect((await draft.json()).data.state).toBe('not-sent');
    expect((await GET(get('/api/dealer/campaigns/x/performance'), params('x'))).status).toBe(404);
  });
});

describe('GET /api/campaigns/:id/open (push açılma)', () => {
  it('müşteri için bir kez kaydeder ve mekân sayfasına yönlendirir', async () => {
    seedCampaign({ status: 'sent', sentAt: new Date() });
    mockRequireAuth.mockImplementation(async () => ({ session: { user: { id: 'r3', role: 'CUSTOMER' } } }));
    const { GET } = await import('@/app/api/campaigns/[id]/open/route');
    const r1 = await GET(get('/api/campaigns/c1/open'), params('c1'));
    const r2 = await GET(get('/api/campaigns/c1/open'), params('c1'));
    expect(r1.status).toBe(302);
    expect(r1.headers.get('location')).toBe('http://localhost/customer/places/dealer-1');
    expect(r2.status).toBe(302);
    expect(db.analytics.filter((e) => e.userId === 'r3')).toHaveLength(1);
  });
});
