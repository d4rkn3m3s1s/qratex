process.env.ECONOMY_APPROVAL_SECRET = 'test-approval-secret-0123456789';
/**
 * P0-19 — /api/admin/economy/adjust-approvals: dört göz onay belirteci.
 *
 * Saldırı senaryoları:
 *   - Onay, talep eden admin dışında üçüncü bir admin tarafından kullanılabiliyordu (belirteç
 *     yalnız kullanıcı + miktara bağlıydı). Artık belirteç talep edene de bağlı.
 *   - Admin kendi talebini onaylayamaz; rol JWT'den değil DB'den okunur.
 */
import { NextRequest } from 'next/server';
import { verifyAdjustApproval } from '@/lib/economy/admin-approval';

const mockSession = { user: { id: 'admin2', role: 'ADMIN' } };
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: mockSession })),
}));
jest.mock('@/lib/request-metadata', () => ({
  getAuditRequestMeta: () => ({ ipAddress: '1.1.1.1', userAgent: 'jest' }),
}));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));

const mockFindMany = jest.fn();
const mockAudit = jest.fn(async () => ({}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    auditLog: { create: (...a: unknown[]) => mockAudit(...(a as [])) },
  },
}));

const ADMINS = [
  { id: 'admin1', role: 'ADMIN', email: 'a@x.com', name: 'A' },
  { id: 'admin2', role: 'ADMIN', email: 'b@x.com', name: 'B' },
];

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/admin/economy/adjust-approvals/route');
  const req = new NextRequest('http://localhost/api/admin/economy/adjust-approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.user.id = 'admin2';
  mockFindMany.mockResolvedValue(ADMINS);
});

describe('POST /api/admin/economy/adjust-approvals', () => {
  it('belirteç talep eden admine bağlı: yalnız o admin kullanabilir', async () => {
    const r = await post({ userId: 'u1', requesterId: 'admin1', delta: 20_000, reason: 'Büyük etkinlik ödülü' });
    expect(r.status).toBe(200);
    const token = r.body.approvalToken as string;

    const claims = verifyAdjustApproval(token, { requesterId: 'admin1', userId: 'u1', delta: 20_000, xp: 0 });
    expect(claims).toMatchObject({ approverId: 'admin2', requesterId: 'admin1' });

    expect(() => verifyAdjustApproval(token, { requesterId: 'admin3', userId: 'u1', delta: 20_000, xp: 0 })).toThrow(
      /başka bir yöneticinin talebi/
    );
    expect(mockAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ADMIN_POINTS_ADJUST_APPROVED', userId: 'admin2', entityId: 'u1' }),
    });
  });

  it('kendi talebini onaylayamaz (403), belirteç üretilmez', async () => {
    mockSession.user.id = 'admin1';
    const r = await post({ userId: 'u1', requesterId: 'admin1', delta: 20_000, reason: 'Büyük etkinlik ödülü' });
    expect(r.status).toBe(403);
    expect(r.body.approvalToken).toBeUndefined();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('talep eden DB’de ADMIN değilse 403', async () => {
    mockFindMany.mockResolvedValue([ADMINS[1], { ...ADMINS[0], role: 'DEALER' }]);
    const r = await post({ userId: 'u1', requesterId: 'admin1', delta: 20_000, reason: 'Büyük etkinlik ödülü' });
    expect(r.status).toBe(403);
    expect(r.body.approvalToken).toBeUndefined();
  });
});
