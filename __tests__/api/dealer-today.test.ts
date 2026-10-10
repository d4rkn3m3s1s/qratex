/**
 * Bayi "Bugün" BFF uçları (`/api/dealer/today/**`).
 *
 *  - Varsayılan reddet: CUSTOMER 403 ve DB'ye dokunulmaz; ADMIN `dealerId` vermeden 400.
 *  - Kiracı kapsamı: bütün sorgular oturumdaki bayiyle sınırlı (ham SQL değerleri dahil).
 *  - Hata görünür: sorgu hatası 500 zarfı döner — "200 + sıfırlar" yok (dealer.md B4).
 *  - Yapılacaklar: başka bayinin geri bildirimine bağlanamaz (404), yinelenen 409, gerçek kayıt.
 *  - Haftalık: GET LLM çağırmaz; anlatı yalnız POST ile, AI kapalıyken 503.
 */
import { NextRequest } from 'next/server';

jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 100 }) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const mockRedisSet = jest.fn();
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null), redisSetJson: (...a: unknown[]) => mockRedisSet(...a) }));

const mockModuleBlocked = jest.fn(async () => null as unknown);
const mockControls = jest.fn(async () => ({}) as Record<string, boolean>);
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: () => mockModuleBlocked(),
  getModuleControls: () => mockControls(),
}));
const mockChat = jest.fn();
jest.mock('@/lib/ai-engine', () => ({ isAIConfigured: () => true, runChatCompletion: (...a: unknown[]) => mockChat(...a) }));
const mockAiEnabled = jest.fn(async () => true);
jest.mock('@/lib/ai-policy', () => ({ isDealerAiEnabled: () => mockAiEnabled() }));

const db = {
  $queryRaw: jest.fn(),
  user: { findUnique: jest.fn() },
  dealerLocation: { count: jest.fn() },
  qRCode: { count: jest.fn() },
  product: { count: jest.fn() },
  feedback: { findFirst: jest.fn(), findMany: jest.fn() },
  consumptionReview: { findFirst: jest.fn() },
  consumption: { count: jest.fn() },
  remedyOffer: { groupBy: jest.fn() },
  incident: { groupBy: jest.fn() },
  actionItem: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  dealerWeeklyBrief: { findFirst: jest.fn(), findMany: jest.fn() },
};
const mockConnectivity = jest.fn(() => false);
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: (e: unknown) => mockConnectivity(e) }));

import { GET as getToday } from '@/app/api/dealer/today/route';
import { GET as getWeekly } from '@/app/api/dealer/today/weekly/route';
import { POST as postNarrative } from '@/app/api/dealer/today/weekly/narrative/route';
import { POST as postTodo } from '@/app/api/dealer/today/todos/route';
import { PATCH as patchTodo } from '@/app/api/dealer/today/todos/[id]/route';

function session(role: string, id = 'dealer-1') {
  return { session: { user: { id, role }, expires: '2099-01-01' } };
}

function asRole(role: string, id?: string) {
  mockRequireAuth.mockImplementation(async (roles: string[]) =>
    roles.includes(role)
      ? session(role, id)
      : { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) }
  );
}

function req(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

function sqlText(arg: unknown): string {
  const a = arg as { sql?: string; strings?: string[] };
  return a.sql ?? (a.strings ?? []).join('?');
}
function sqlValues(arg: unknown): unknown[] {
  return ((arg as { values?: unknown[] }).values ?? []) as unknown[];
}

function seedToday() {
  db.$queryRaw.mockImplementation(async (q: unknown) => {
    const s = sqlText(q);
    if (s.includes('percentile_cont')) return [{ median: 5400 }];
    if (s.includes('oldest_neg')) return [{ total: 3, neg: 1, overdue: 1, recent: 2, oldest_neg: new Date('2026-10-08T08:00:00Z') }];
    if (s.includes('LIMIT 4'))
      return [{ id: 'fb-9', src: 'qr', rating: 1, text: 'Soğuk geldi', createdAt: new Date('2026-10-08T08:00:00Z'), place: 'Teras' }];
    if (s.includes('HAVING COUNT')) return [];
    if (s.includes('AS ysame')) return [{ today: 2, ysame: 1 }];
    if (s.includes('GROUP BY u.src, u.day')) return [{ src: 'qr', day: '2026-10-10', n: 2, sum: 9, neg: 0, neu: 0, pos: 2, replied: 1 }];
    if (s.includes('FROM "Consumption"')) return [{ day: '2026-10-10', n: 5 }];
    return [];
  });
  db.user.findUnique.mockResolvedValue({ name: 'Ayşe', businessName: 'Kafe Ada', businessDesc: null, address: null, latitude: null, longitude: null });
  db.dealerLocation.count.mockResolvedValue(0);
  db.qRCode.count.mockResolvedValue(2);
  db.product.count.mockResolvedValue(0);
  db.feedback.findFirst.mockResolvedValue({ id: 'fb-1' });
  db.consumptionReview.findFirst.mockResolvedValue(null);
  db.consumption.count.mockResolvedValue(3);
  db.remedyOffer.groupBy.mockResolvedValue([{ status: 'awaiting_dealer_approval', _count: { _all: 2 }, _min: { createdAt: new Date('2026-10-09T08:00:00Z') } }]);
  db.incident.groupBy.mockResolvedValue([]);
  db.actionItem.findMany.mockResolvedValue([]);
  db.actionItem.count.mockResolvedValue(0);
  db.feedback.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnectivity.mockReturnValue(false);
  mockModuleBlocked.mockResolvedValue(null);
  mockControls.mockResolvedValue({});
  mockAiEnabled.mockResolvedValue(true);
});

describe('GET /api/dealer/today', () => {
  it('CUSTOMER reddedilir, DB’ye dokunulmaz', async () => {
    asRole('CUSTOMER', 'c-1');
    const res = await getToday(req('/api/dealer/today'), {});
    expect(res.status).toBe(403);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('ADMIN işletme seçmeden 400', async () => {
    asRole('ADMIN', 'admin-1');
    const res = await getToday(req('/api/dealer/today'), {});
    expect(res.status).toBe(400);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('DEALER: tüm sorgular kendi kimliğiyle; deterministik metrik + kurulum + öneriler', async () => {
    asRole('DEALER');
    seedToday();
    const res = await getToday(req('/api/dealer/today?fresh=1'), {});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const d = json.data;
    expect(d.dealer.name).toBe('Kafe Ada');
    expect(d.metrics.avgRating7d.value).toBe(4.5);
    expect(d.metrics.feedbackToday).toMatchObject({ value: 2, delta: { value: 1 } });
    expect(d.metrics.medianFirstResponseSec).toBe(5400);
    expect(d.setup.visible).toBe(true); // açıklama + konum eksik
    expect(d.setup.nextKey).toBe('profile');
    expect(d.nextActions.map((a: { kind: string }) => a.kind)).toEqual(['unanswered_negative', 'remedy_approval', 'unanswered_recent']);
    expect(d.waiting.items[0]).toMatchObject({ id: 'fb-9', href: '/dealer/inbox?id=qr-fb-9', place: 'Teras' });
    expect(d.ops.remedy.awaitingApproval).toBe(2);

    for (const call of db.$queryRaw.mock.calls) expect(sqlValues(call[0])).toContain('dealer-1');
    expect(db.actionItem.findMany.mock.calls[0][0].where.dealerId).toBe('dealer-1');
    expect(db.feedback.findFirst.mock.calls[0][0].where.qrCode.dealerId).toBe('dealer-1');
    expect(db.remedyOffer.groupBy.mock.calls[0][0].where.dealerId).toBe('dealer-1');
    expect(mockChat).not.toHaveBeenCalled(); // GET'te LLM yok
  });

  it('DEALER başka bayinin dealerId’sini isteyemez', async () => {
    asRole('DEALER');
    const res = await getToday(req('/api/dealer/today?dealerId=dealer-2'), {});
    expect(res.status).toBe(403);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('sorgu hatası görünür hata döner (200 + sıfırlar yok)', async () => {
    asRole('DEALER');
    seedToday();
    db.incident.groupBy.mockRejectedValue(new Error('statement timeout'));
    const res = await getToday(req('/api/dealer/today?fresh=1'), {});
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.data).toBeUndefined();
  });

  it('DB erişilemez → 503 retryable', async () => {
    asRole('DEALER');
    seedToday();
    mockConnectivity.mockReturnValue(true);
    db.user.findUnique.mockRejectedValue(new Error('P1001'));
    const res = await getToday(req('/api/dealer/today?fresh=1'), {});
    expect(res.status).toBe(503);
    expect((await res.json()).retryable).toBe(true);
  });
});

describe('yapılacaklar', () => {
  it('başka bayinin geri bildirimi → 404, kayıt açılmaz', async () => {
    asRole('DEALER');
    db.feedback.findFirst.mockResolvedValue(null);
    const res = await postTodo(req('/api/dealer/today/todos', 'POST', { feedbackId: 'fb-x', text: 'Garson eğitimi verin' }), {});
    expect(res.status).toBe(404);
    expect(db.feedback.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'fb-x', qrCode: { dealerId: 'dealer-1' } });
    expect(db.actionItem.create).not.toHaveBeenCalled();
  });

  it('aynı öneri ikinci kez → 409', async () => {
    asRole('DEALER');
    db.feedback.findFirst.mockResolvedValue({ id: 'fb-1' });
    db.actionItem.findMany.mockResolvedValue([{ suggestionText: 'Garson eğitimi verin.', status: 'pending' }]);
    const res = await postTodo(req('/api/dealer/today/todos', 'POST', { feedbackId: 'fb-1', text: 'garson eğitimi verin' }), {});
    expect(res.status).toBe(409);
    expect(db.actionItem.create).not.toHaveBeenCalled();
  });

  it('öneri gerçek aksiyon kalemine dönüşür; yoksay iptal kaydı bırakır', async () => {
    asRole('DEALER');
    db.feedback.findFirst.mockResolvedValue({ id: 'fb-1' });
    db.actionItem.findMany.mockResolvedValue([]);
    db.actionItem.create.mockResolvedValue({ id: 'ai-1', status: 'pending' });
    const ok = await postTodo(req('/api/dealer/today/todos', 'POST', { feedbackId: 'fb-1', text: 'Garson eğitimi verin', priority: 'high' }), {});
    expect(ok.status).toBe(201);
    expect(db.actionItem.create.mock.calls[0][0].data).toMatchObject({ dealerId: 'dealer-1', feedbackId: 'fb-1', status: 'pending', priority: 'high', sourceModule: 'today' });

    db.actionItem.create.mockResolvedValue({ id: 'ai-2', status: 'cancelled' });
    await postTodo(req('/api/dealer/today/todos', 'POST', { feedbackId: 'fb-1', text: 'Menüyü sadeleştirin', dismiss: true }), {});
    expect(db.actionItem.create.mock.calls[1][0].data).toMatchObject({ status: 'cancelled' });
  });

  it('haftalık rapor önerisi (geri bildirimsiz) bayi geneli iş olur; açık aynısı varsa 409', async () => {
    asRole('DEALER');
    db.actionItem.findMany.mockResolvedValue([]);
    db.actionItem.create.mockResolvedValue({ id: 'ai-3', status: 'pending' });
    const ok = await postTodo(req('/api/dealer/today/todos', 'POST', { text: 'Düşük puanlara 24 saatte yanıt', source: 'weekly_brief' }), {});
    expect(ok.status).toBe(201);
    expect(db.feedback.findFirst).not.toHaveBeenCalled();
    expect(db.actionItem.findMany.mock.calls[0][0].where).toMatchObject({ dealerId: 'dealer-1', feedbackId: null });
    expect(db.actionItem.create.mock.calls[0][0].data).toMatchObject({ dealerId: 'dealer-1', feedbackId: null, sourceModule: 'weekly_brief' });

    db.actionItem.findMany.mockResolvedValue([{ suggestionText: 'Düşük puanlara 24 saatte yanıt', status: 'pending' }]);
    const dup = await postTodo(req('/api/dealer/today/todos', 'POST', { text: 'düşük puanlara 24 saatte yanıt', source: 'weekly_brief' }), {});
    expect(dup.status).toBe(409);
  });

  it('ADMIN yazamaz (rol listesinde yok)', async () => {
    asRole('ADMIN', 'admin-1');
    const res = await postTodo(req('/api/dealer/today/todos?dealerId=dealer-1', 'POST', { feedbackId: 'fb-1', text: 'Garson eğitimi verin' }), {});
    expect(res.status).toBe(403);
    expect(db.actionItem.create).not.toHaveBeenCalled();
  });

  it('tamamla: yalnız kendi kaydı; yoksa 404', async () => {
    asRole('DEALER');
    db.actionItem.updateMany.mockResolvedValue({ count: 1 });
    const ok = await patchTodo(req('/api/dealer/today/todos/ai-1', 'PATCH', { status: 'done' }), { params: Promise.resolve({ id: 'ai-1' }) });
    expect(ok.status).toBe(200);
    expect(db.actionItem.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'ai-1', dealerId: 'dealer-1' });

    db.actionItem.updateMany.mockResolvedValue({ count: 0 });
    db.actionItem.findFirst.mockResolvedValue(null);
    const missing = await patchTodo(req('/api/dealer/today/todos/ai-x', 'PATCH', { status: 'done' }), { params: Promise.resolve({ id: 'ai-x' }) });
    expect(missing.status).toBe(404);
  });
});

describe('haftalık rapor', () => {
  function seedWeek() {
    db.$queryRaw.mockImplementation(async (q: unknown) => {
      const s = sqlText(q);
      if (s.includes('GROUP BY 1, 2'))
        return [
          { cur: true, src: 'qr', n: 4, sum: 16, neg: 1, replied: 2 },
          { cur: false, src: 'qr', n: 2, sum: 6, neg: 1, replied: 0 },
        ];
      return [];
    });
    db.consumption.count.mockResolvedValue(7);
    db.feedback.findMany.mockResolvedValue([{ themes: [{ theme: 'Hizmet', sentiment: 'negative' }] }]);
    db.dealerWeeklyBrief.findFirst.mockResolvedValue({ recommendedAction: 'Düşük puanlara 24 saatte yanıt', createdAt: new Date('2026-09-28T08:00:00Z') });
  }

  it('Pazartesi olmayan hafta → 400', async () => {
    asRole('DEALER');
    const res = await getWeekly(req('/api/dealer/today/weekly?week=2026-09-30'), {});
    expect(res.status).toBe(400);
  });

  it('GET deterministik sayılar + kural tabanlı öneri; LLM çağrılmaz', async () => {
    asRole('DEALER');
    seedWeek();
    const res = await getWeekly(req('/api/dealer/today/weekly?week=2026-09-28'), {});
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.week).toBe('2026-09-28');
    expect(d.weekEnd).toBe('2026-10-04');
    expect(d.metrics.feedback.value).toBe(4);
    expect(d.metrics.avgRating.value).toBe(4);
    expect(d.autoRecommendation.text).toContain('24 saatte');
    expect(d.themes[0]).toMatchObject({ label: 'Hizmet', negative: 1 });
    expect(d.narrative).toBeNull();
    expect(mockChat).not.toHaveBeenCalled();
    for (const call of db.$queryRaw.mock.calls) expect(sqlValues(call[0])).toContain('dealer-1');
  });

  it('anlatı: bayi AI’ı kapalıysa 503, LLM çağrılmaz', async () => {
    asRole('DEALER');
    seedWeek();
    mockAiEnabled.mockResolvedValue(false);
    const res = await postNarrative(req('/api/dealer/today/weekly/narrative', 'POST', { week: '2026-09-28' }), {});
    expect(res.status).toBe(503);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('anlatı: modül kapalı → 403 MODULE_DISABLED', async () => {
    asRole('DEALER');
    mockModuleBlocked.mockResolvedValue(new Response(null, { status: 403 }));
    const res = await postNarrative(req('/api/dealer/today/weekly/narrative', 'POST', { week: '2026-09-28' }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
  });

  it('anlatı: yalnız sayılar gider, düz metin önbelleğe yazılır', async () => {
    asRole('DEALER');
    seedWeek();
    mockChat.mockResolvedValue({ content: '**Güzel** bir hafta.', modelUsed: 'x' });
    const res = await postNarrative(req('/api/dealer/today/weekly/narrative', 'POST', { week: '2026-09-28' }), {});
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.text).toBe('Güzel bir hafta.');
    const call = mockChat.mock.calls[0][0];
    expect(call).toMatchObject({ dealerId: 'dealer-1', task: 'insights' });
    expect(call.user).toContain('Geri bildirim sayısı: 4');
    expect(mockRedisSet.mock.calls.some((c) => String(c[0]).includes('narrative') && String(c[0]).includes('dealer-1:2026-09-28'))).toBe(true);
  });
});
