/**
 * P0-34 — KVKK başvuru uçları: denetimde DOĞRULANAN senaryoların yeniden üretimi.
 *
 *  1. Yönetici "Tamamlandı" diyerek silme talebini YÜRÜTMEDEN kapatabiliyordu (PATCH status).
 *  2. Eski istemci `?action=anonymize` ile onaysız silme yürütebiliyordu.
 *  3. `privacy-request` ucu istemcinin verdiği `email`'e (keyfi adres) markalı e-posta
 *     gönderiyordu ve sınırsızdı → spam/oltalama aracı.
 *  4. Self-servis "Verilerimi indir" kuyruğa ve kanıta düşmüyordu.
 * Prisma, oturum, e-posta ve sayaç mock'lanır; gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...a: unknown[]) => mockRateLimit(...a),
}));

const mockSendDsrEmail = jest.fn();
jest.mock('@/lib/dsr-email', () => ({
  sendDsrEmail: (...a: unknown[]) => mockSendDsrEmail(...a),
}));

const mockAnonymize = jest.fn();
const mockExport = jest.fn();
jest.mock('@/lib/gdpr-core', () => ({
  anonymizeUser: (...a: unknown[]) => mockAnonymize(...a),
  exportUserData: (...a: unknown[]) => mockExport(...a),
  exportDigest: () => 'digest-abc',
  countUserData: jest.fn(async () => ({})),
  purgeRegistryPersonalData: jest.fn(async () => ({ counts: {}, objectUrls: [] })),
  deletePersonalObjects: jest.fn(async () => 0),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';

type Ev = { id: string; requestId: string; type: string; actorId: string | null; detail?: unknown; createdAt: Date };
let events: Ev[] = [];

const REQUEST = {
  id: 'r1',
  userId: 'u1',
  email: 'ayse@test.local',
  type: 'deletion',
  status: 'in_review',
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

function primeStore(row: Record<string, unknown> = REQUEST) {
  events = [{ id: 'e0', requestId: 'r1', type: 'received', actorId: 'u1', createdAt: new Date() }];
  db.dataSubjectRequest.findUnique.mockImplementation(async () => row);
  db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 1 });
  db.dsrEvent.create.mockImplementation(async ({ data }: { data: Omit<Ev, 'id' | 'createdAt'> }) => {
    const ev = { ...data, id: `e${events.length}`, createdAt: new Date() } as Ev;
    events.push(ev);
    return { id: ev.id };
  });
  db.dsrEvent.findMany.mockImplementation(async () => events.map((e) => ({ ...e })));
  db.auditLog.create.mockResolvedValue({ id: 'al' });
  db.user.findMany.mockResolvedValue([]);
}

const ctx = { params: Promise.resolve({ id: 'r1' }) };

function adminReq(method: string, body?: unknown, search = '') {
  return new NextRequest(`http://localhost/api/admin/privacy-requests/r1${search}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9', 'user-agent': 'jest' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  mockRateLimit.mockResolvedValue({ ok: true });
  mockSendDsrEmail.mockResolvedValue({ ok: true });
  setSession(as('admin-1', 'ADMIN', { name: 'Yönetici' }));
  primeStore();
});

describe('Yönetici: "Tamamlandı" yalnız yürütme kanıtıyla', () => {
  it('HATA SENARYOSU: PATCH {status:"completed"} → 409 NO_EVIDENCE, talep kapanmaz', async () => {
    const { PATCH } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await PATCH(adminReq('PATCH', { status: 'completed' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NO_EVIDENCE');
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalled();
    expect(db.dataSubjectRequest.update).not.toHaveBeenCalled();
    expect(mockAnonymize).not.toHaveBeenCalled();
  });

  it('SALDIRI: eski `?action=anonymize` onay e-postası olmadan silme YÜRÜTEMEZ', async () => {
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', undefined, '?action=anonymize'), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CONFIRMATION_REQUIRED');
    expect(mockAnonymize).not.toHaveBeenCalled();
  });

  it('yanlış onay e-postası → 400, hiçbir şey yürütülmez', async () => {
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'erase', confirmEmail: 'baska@test.local' }), ctx);
    expect(res.status).toBe(400);
    expect(mockAnonymize).not.toHaveBeenCalled();
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalled();
  });

  it('silme yürütülür: anonimleştirme ile AYNI tx içinde kanıt + kapanış, aktör = yönetici', async () => {
    mockAnonymize.mockImplementation(async (_userId: string, opts: { withinTx: (tx: unknown, c: { counts: Record<string, number> }) => Promise<void> }) => {
      await opts.withinTx(db, { counts: { 'QraChatLog.userId': 4, 'PushSubscription.userId': 1 } });
      return { anonymized: true, alreadyAnonymized: false, counts: { 'QraChatLog.userId': 4 }, archivedQrCodes: 0, clearedSessions: 0 };
    });
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'erase', confirmEmail: 'AYSE@test.local' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed).toBe(true);

    const [userId, opts] = mockAnonymize.mock.calls[0];
    expect(userId).toBe('u1');
    expect(opts.actor).toMatchObject({ id: 'admin-1', role: 'ADMIN' });
    expect(opts.reason).toBe('dsr_erasure');

    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['erasure_executed', 'completed', 'notified']));
    const exec = events.find((e) => e.type === 'erasure_executed')!;
    expect(exec.actorId).toBe('admin-1');
    expect(exec.detail).toEqual({ counts: { 'QraChatLog.userId': 4, 'PushSubscription.userId': 1 } });
    expect(db.dataSubjectRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    );
    // Sonuç bildirimi BAŞVURU e-postasına (istemci adresi değil).
    expect(mockSendDsrEmail).toHaveBeenCalledWith('ayse@test.local', 'erased', expect.any(Object));
  });

  it('SALDIRI (kalite turu): manuel talep YÖNETİCİ hesabına açılsa da silme yürütülmez (409 ADMIN_TARGET)', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'erase', confirmEmail: 'ayse@test.local' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ADMIN_TARGET');
    expect(mockAnonymize).not.toHaveBeenCalled();
    expect(mockSendDsrEmail).not.toHaveBeenCalled();
  });

  it('kalite turu: yönetici kendi hesabını kuyruktan silemez (403)', async () => {
    primeStore({ ...REQUEST, userId: 'admin-1' });
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'erase', confirmEmail: 'ayse@test.local' }), ctx);
    expect(res.status).toBe(403);
    expect(mockAnonymize).not.toHaveBeenCalled();
  });

  it('erişim talebi: bildirim gönderilemezse talep AÇIK kalır (sahibine ulaşmayan paket "tamamlandı" sayılmaz)', async () => {
    primeStore({ ...REQUEST, type: 'access' });
    mockExport.mockResolvedValue({ counts: { qraChatLogs: 2 } });
    mockSendDsrEmail.mockResolvedValue({ ok: false });
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'fulfill_access' }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.completed).toBe(false);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['export_generated', 'notify_failed']));
    expect(events.map((e) => e.type)).not.toContain('completed');
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    );
  });

  it('müşteri rolü yönetici komutu çalıştıramaz (403)', async () => {
    setSession(as('u1', 'CUSTOMER'));
    const { POST } = await import('@/app/api/admin/privacy-requests/[id]/route');
    const res = await POST(adminReq('POST', { action: 'erase', confirmEmail: 'ayse@test.local' }), ctx);
    expect(res.status).toBe(403);
    expect(mockAnonymize).not.toHaveBeenCalled();
  });
});

describe('Veri sahibi: POST /api/customer/privacy-request', () => {
  function customerReq(body: unknown) {
    return new NextRequest('http://localhost/api/customer/privacy-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    setSession(as('user-1', 'CUSTOMER'));
    db.user.findUnique.mockResolvedValue({ email: 'gercek@test.local', anonymizedAt: null });
    db.dataSubjectRequest.findFirst.mockResolvedValue(null);
    db.dataSubjectRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-r',
      type: data.type,
      status: data.status,
      createdAt: new Date(),
      dueAt: data.dueAt,
    }));
    db.dataSubjectRequest.update.mockResolvedValue({});
  });

  it('SALDIRI: istemcinin verdiği `email` YOK SAYILIR; makbuz yalnız hesap e-postasına gider', async () => {
    const { POST } = await import('@/app/api/customer/privacy-request/route');
    const res = await POST(customerReq({ type: 'access', email: 'kurban@baska.test' }), {});
    expect(res.status).toBe(201);
    expect(db.dataSubjectRequest.create.mock.calls[0][0].data.email).toBe('gercek@test.local');
    expect(mockSendDsrEmail).toHaveBeenCalledTimes(1);
    expect(mockSendDsrEmail.mock.calls[0][0]).toBe('gercek@test.local');
    // 30 gün yasal süre ve "received" kanıtı başvuruyla birlikte doğar.
    expect(db.dataSubjectRequest.create.mock.calls[0][0].data.dueAt).toBeInstanceOf(Date);
    expect(events.map((e) => e.type)).toContain('received');
  });

  it('kullanıcı başına 24 saatte en fazla 3 başvuru (kalıcı sayaç)', async () => {
    const { POST } = await import('@/app/api/customer/privacy-request/route');
    await POST(customerReq({ type: 'objection', message: 'Güven puanıma itiraz ediyorum.' }), {});
    const [bucket, max, windowMs] = mockRateLimit.mock.calls[0];
    expect(bucket).toContain('u:user-1');
    expect(max).toBe(3);
    expect(windowMs).toBe(24 * 60 * 60 * 1000);
  });

  it('sınır aşıldı → 429, kayıt ve e-posta YOK', async () => {
    mockRateLimit.mockResolvedValue({ ok: false, retryAfterMs: 3_600_000 });
    const { POST } = await import('@/app/api/customer/privacy-request/route');
    const res = await POST(customerReq({ type: 'access' }), {});
    expect(res.status).toBe(429);
    expect(db.dataSubjectRequest.create).not.toHaveBeenCalled();
    expect(mockSendDsrEmail).not.toHaveBeenCalled();
  });

  it('aynı türde açık başvuru varken yenisi açılmaz (409)', async () => {
    db.dataSubjectRequest.findFirst.mockResolvedValue({ id: 'open-1' });
    const { POST } = await import('@/app/api/customer/privacy-request/route');
    const res = await POST(customerReq({ type: 'deletion' }), {});
    expect(res.status).toBe(409);
    expect(db.dataSubjectRequest.create).not.toHaveBeenCalled();
  });
});

describe('Self-servis "Verilerimi indir": kanıtlı erişim başvurusu', () => {
  it('paket verilir VE erişim başvurusu kanıtıyla (üretildi + indirildi) kapanır', async () => {
    setSession(as('user-1', 'CUSTOMER'));
    db.user.findUnique.mockResolvedValue({ email: 'gercek@test.local', anonymizedAt: null });
    db.dataSubjectRequest.create.mockResolvedValue({ id: 'r1' });
    primeStore({ ...REQUEST, type: 'access', status: 'in_review', userId: 'user-1' });
    mockExport.mockResolvedValue({ format: 'qratex-kvkk-export-v2', counts: { qraChatLogs: 1 }, sections: { qraChatLogs: [{}] } });
    const { POST } = await import('@/app/api/customer/privacy-request/self-export/route');
    const res = await POST(new NextRequest('http://localhost/api/customer/privacy-request/self-export', { method: 'POST' }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="qratex-verilerim-/);
    expect(JSON.parse(await res.text()).sections.qraChatLogs).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['export_generated', 'export_downloaded', 'completed'])
    );
    expect(events.find((e) => e.type === 'export_generated')!.detail).toMatchObject({ digest: 'digest-abc' });
  });
});
