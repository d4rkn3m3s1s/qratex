/**
 * /admin/privacy uçları: e-postayla gelen başvurunun kuyruğa alınması (yasal süre, hesap eşleşmesi,
 * kanıt olayı, tekrar engeli) ve 5651 CSV dışa aktarımının denetlenmesi. Sahte Prisma; DB yok.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));

const mockSendDsrEmail = jest.fn();
jest.mock('@/lib/dsr-email', () => ({ sendDsrEmail: (...a: unknown[]) => mockSendDsrEmail(...a) }));

import { $transaction, db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';

function req(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9', 'user-agent': 'jest' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  mockSendDsrEmail.mockResolvedValue({ ok: true });
  setSession(as('admin-1', 'ADMIN'));
  db.dsrEvent.create.mockResolvedValue({ id: 'e1' });
  db.auditLog.create.mockResolvedValue({ id: 'a1' });
  db.dataSubjectRequest.findFirst.mockResolvedValue(null);
  db.dataSubjectRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r9',
    type: data.type,
    createdAt: data.createdAt,
    dueAt: data.dueAt,
    email: data.email,
  }));
  db.dataSubjectRequest.update.mockResolvedValue({});
});

describe('POST /api/admin/privacy-requests (manuel başvuru)', () => {
  it('hesaba bağlar, yasal süreyi başvuru gününden başlatır, kanıt olayını yöneticiyle yazar', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u1', email: 'ayse@test.local', anonymizedAt: null });
    const { POST } = await import('@/app/api/admin/privacy-requests/route');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() - 5 * 86400000));
    const res = await POST(
      req('/api/admin/privacy-requests', 'POST', { type: 'access', email: 'AYSE@test.local', channel: 'email', receivedOn: today }),
      ctx
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.linkedAccount).toBe(true);
    const data = db.dataSubjectRequest.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.email).toBe('ayse@test.local');
    expect((data.dueAt as Date).getTime() - (data.createdAt as Date).getTime()).toBe(30 * 86400000);
    const received = db.dsrEvent.create.mock.calls.find((c: unknown[]) => (c[0] as { data: { type: string } }).data.type === 'received')![0];
    expect(received.data.actorId).toBe('admin-1');
    expect(received.data.detail).toMatchObject({ channel: 'email', manual: true });
    // Makbuz bildirimi `receipt` olarak işaretlenir (teslim kanıtı sayılmaz).
    const receipt = db.dsrEvent.create.mock.calls.find((c: unknown[]) => (c[0] as { data: { type: string } }).data.type === 'notified')![0];
    expect(receipt.data.detail).toEqual({ kind: 'receipt' });
    expect($transaction).toHaveBeenCalled();
  });

  it('aynı hesapta aynı türde açık talep varsa 409', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u1', email: 'ayse@test.local', anonymizedAt: null });
    db.dataSubjectRequest.findFirst.mockResolvedValue({ id: 'r1' });
    const { POST } = await import('@/app/api/admin/privacy-requests/route');
    const res = await POST(req('/api/admin/privacy-requests', 'POST', { type: 'deletion', email: 'ayse@test.local', channel: 'phone' }), ctx);
    expect(res.status).toBe(409);
    expect(db.dataSubjectRequest.create).not.toHaveBeenCalled();
  });

  it('hesap yoksa talep bağlanmadan kuyruğa girer; gelecekteki tarih reddedilir', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/privacy-requests/route');
    const ok = await POST(req('/api/admin/privacy-requests', 'POST', { type: 'objection', email: 'yeni@test.local', channel: 'mail' }), ctx);
    expect(ok.status).toBe(201);
    expect(db.dataSubjectRequest.create.mock.calls[0][0].data.userId).toBeNull();

    const bad = await POST(
      req('/api/admin/privacy-requests', 'POST', { type: 'access', email: 'x@test.local', channel: 'email', receivedOn: '2999-01-01' }),
      ctx
    );
    expect(bad.status).toBe(400);
  });

  it('yönetici olmayan 403', async () => {
    setSession(as('c1', 'CUSTOMER'));
    const { POST } = await import('@/app/api/admin/privacy-requests/route');
    const res = await POST(req('/api/admin/privacy-requests', 'POST', { type: 'access', email: 'a@test.local', channel: 'email' }), ctx);
    expect([401, 403]).toContain(res.status);
  });
});

describe('GET /api/admin/privacy/logs/export', () => {
  it('CSV + SHA-256 döner ve dışa aktarımı denetim kaydına yazar', async () => {
    db.auditLog.findMany.mockResolvedValue([
      { id: 'a1', action: 'login', entity: 'User', entityId: null, userId: null, createdAt: new Date('2026-10-10T10:00:00Z'), ipAddress: '85.1.2.3', userAgent: null },
    ]);
    db.cardAuditLog.findMany.mockResolvedValue([]);
    db.suspiciousActivity.findMany.mockResolvedValue([]);
    db.analyticsEvent.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/privacy/logs/export/route');
    const res = await GET(req('/api/admin/privacy/logs/export?source=audit'), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const digest = res.headers.get('x-content-sha256');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    const csv = await res.text();
    expect(csv).not.toContain('85.1.2.3');
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ userId: 'admin-1', action: 'compliance_log_export', ipAddress: '9.9.9.9' });
    expect(audit.newData).toMatchObject({ rows: 1, sha256: digest, truncated: false });
  });
});
