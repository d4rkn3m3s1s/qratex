/**
 * P0-01 kapanış doğrulaması — `/api/admin/*` DIŞINDA kalan yönetici yazma uçları da gizli kapıdan
 * geçmeli.
 *
 * Saldırı senaryosu (önceden): rolü ADMIN yapılmış ama kapı cevabını bilmeyen hesap
 * `/api/admin/*` uçlarında 403 alıyordu; ancak aynı yönetici yetkisini veren şu uçlar ham
 * `getServerSession` rolüne bakıyordu (kapı ve DB rolü yok):
 *   - POST /api/gamification/quests          → yüksek ödüllü görev oluştur, sonra kendisi talep et
 *   - PATCH/DELETE /api/gamification/quests/[id]
 *   - POST /api/gamification/rewards         → maliyeti 1 puan ödül oluştur
 *   - POST /api/gamification/badges          → rozet oluştur
 *   - GET/PATCH /api/security/suspicious     → şüpheli etkinlik listesini oku / kapat
 * Şimdi hepsi `requireAuth(['ADMIN'])` (kapı + DB rolü) kullanır; kapı çerezi olmayan ADMIN 403 alır.
 *
 * Ayrıca P0-07: yönetici rol değişikliği `sessionVersion` artırır ve oturum önbelleğini bayatlatır.
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));

// Ham oturum ADMIN der — artık yetmemeli.
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: jest.fn(async () => ({ user: { id: 'rogue-admin', role: 'ADMIN' } })),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({}) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: (id: string) => mockInvalidate(id) }));

const writes = {
  questCreate: jest.fn(),
  questUpdate: jest.fn(),
  questDelete: jest.fn(),
  rewardCreate: jest.fn(),
  badgeCreate: jest.fn(),
  suspiciousUpdate: jest.fn(),
  suspiciousFindMany: jest.fn(),
};
const userUpdate = jest.fn();
const userFindUnique = jest.fn();
const userFindMany = jest.fn();
const userUpdateMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    quest: {
      create: (...a: unknown[]) => writes.questCreate(...a),
      update: (...a: unknown[]) => writes.questUpdate(...a),
      delete: (...a: unknown[]) => writes.questDelete(...a),
      findUnique: jest.fn(async () => ({ id: 'q1' })),
    },
    reward: { create: (...a: unknown[]) => writes.rewardCreate(...a) },
    badge: { create: (...a: unknown[]) => writes.badgeCreate(...a) },
    suspiciousActivity: {
      update: (...a: unknown[]) => writes.suspiciousUpdate(...a),
      findMany: (...a: unknown[]) => writes.suspiciousFindMany(...a),
      count: jest.fn(async () => 0),
    },
    user: {
      update: (...a: unknown[]) => userUpdate(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
      updateMany: (...a: unknown[]) => userUpdateMany(...a),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  },
  isPrismaConnectivityError: () => false,
}));

const gateDenied = () => ({
  error: NextResponse.json(
    { success: false, code: 'ADMIN_GATE_REQUIRED', error: 'Bu işlem için önce yönetici kapısından geçmelisiniz.' },
    { status: 403 }
  ),
});

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(gateDenied());
});

describe('P0-01 · kapısız ADMIN yönetici yazma uçlarını kullanamaz', () => {
  it('POST /api/gamification/quests → 403, görev oluşmaz', async () => {
    const { POST } = await import('@/app/api/gamification/quests/route');
    const res = await POST(req('/api/gamification/quests', 'POST', { name: 'x' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_GATE_REQUIRED');
    expect(mockRequireAuth).toHaveBeenCalledWith(['ADMIN']);
    expect(writes.questCreate).not.toHaveBeenCalled();
  });

  it('PATCH ve DELETE /api/gamification/quests/[id] → 403, görev değişmez', async () => {
    const { PATCH, DELETE } = await import('@/app/api/gamification/quests/[id]/route');
    expect((await PATCH(req('/api/gamification/quests/q1', 'PATCH', { name: 'x' }), params('q1'))).status).toBe(403);
    expect((await DELETE(req('/api/gamification/quests/q1', 'DELETE'), params('q1'))).status).toBe(403);
    expect(writes.questUpdate).not.toHaveBeenCalled();
    expect(writes.questDelete).not.toHaveBeenCalled();
  });

  it('POST /api/gamification/rewards → 403, ödül oluşmaz', async () => {
    const { POST } = await import('@/app/api/gamification/rewards/route');
    const res = await POST(req('/api/gamification/rewards', 'POST', { name: 'Bedava', cost: 1 }));
    expect(res.status).toBe(403);
    expect(writes.rewardCreate).not.toHaveBeenCalled();
  });

  it('POST /api/gamification/badges → 403, rozet oluşmaz', async () => {
    const { POST } = await import('@/app/api/gamification/badges/route');
    const res = await POST(req('/api/gamification/badges', 'POST', { name: 'x' }));
    expect(res.status).toBe(403);
    expect(writes.badgeCreate).not.toHaveBeenCalled();
  });

  it('GET ve PATCH /api/security/suspicious → 403', async () => {
    const { GET, PATCH } = await import('@/app/api/security/suspicious/route');
    expect((await GET(req('/api/security/suspicious', 'GET'))).status).toBe(403);
    expect((await PATCH(req('/api/security/suspicious', 'PATCH', { id: 's1', resolution: 'ok' }))).status).toBe(403);
    expect(writes.suspiciousFindMany).not.toHaveBeenCalled();
    expect(writes.suspiciousUpdate).not.toHaveBeenCalled();
  });

  it('kapıdan geçmiş ADMIN için uç çalışmaya devam eder', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } });
    writes.suspiciousUpdate.mockResolvedValue({ id: 's1', isResolved: true });
    const { PATCH } = await import('@/app/api/security/suspicious/route');
    const res = await PATCH(req('/api/security/suspicious', 'PATCH', { id: 's1', resolution: 'ok' }));
    expect(res.status).toBe(200);
    expect(writes.suspiciousUpdate.mock.calls[0][0].data.resolvedBy).toBe('admin1');
  });
});

describe('P0-07 · rol değişikliği açık oturumları düşürür', () => {
  beforeEach(() => mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } }));

  it('PUT /api/admin/users rol değişince sessionVersion artar ve önbellek bayatlatılır', async () => {
    userFindUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN', email: 'a@x.com', name: 'A', points: 0 });
    userUpdate.mockResolvedValue({ id: 'u1', role: 'CUSTOMER' });
    const { PUT } = await import('@/app/api/admin/users/route');
    const res = await PUT(req('/api/admin/users?id=u1', 'PUT', { role: 'CUSTOMER' }));
    expect(res.status).toBe(200);
    expect(userUpdate.mock.calls[0][0].data).toMatchObject({ role: 'CUSTOMER', sessionVersion: { increment: 1 } });
    expect(mockInvalidate).toHaveBeenCalledWith('u1');
  });

  it('PUT /api/admin/users rol değişmiyorsa oturumlar düşmez', async () => {
    userFindUnique.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', email: 'a@x.com', name: 'A', points: 0 });
    userUpdate.mockResolvedValue({ id: 'u1', role: 'CUSTOMER' });
    const { PUT } = await import('@/app/api/admin/users/route');
    await PUT(req('/api/admin/users?id=u1', 'PUT', { name: 'Yeni Ad' }));
    expect(userUpdate.mock.calls[0][0].data.sessionVersion).toBeUndefined();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('POST /api/admin/users/bulk update_role yalnız rolü değişenlerde sessionVersion artırır', async () => {
    const U1 = 'ckabc0000000000000000000a';
    const U2 = 'ckabc0000000000000000000b';
    userFindMany.mockResolvedValue([{ id: U2 }]);
    userUpdateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(req('/api/admin/users/bulk', 'POST', { action: 'update_role', userIds: [U1, U2], role: 'DEALER' }));
    expect(res.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [U2] }, role: { not: 'DEALER' } },
      data: { role: 'DEALER', sessionVersion: { increment: 1 } },
    });
    expect(mockInvalidate).toHaveBeenCalledWith(U2);
    expect(mockInvalidate).not.toHaveBeenCalledWith(U1);
  });
});
