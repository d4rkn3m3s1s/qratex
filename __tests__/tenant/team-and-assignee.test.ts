/**
 * P0-10 (ekip modülü fail-open + kullanıcı tabanı sızıntısı) ve P0-11 (`assignedToId` ile
 * e-posta toplama) saldırı senaryoları.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
  redisIncrWithTtl: jest.fn(async () => null),
}));
const mockRate = jest.fn(async () => ({ ok: true, remaining: 10 }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...a: unknown[]) => (mockRate as (...x: unknown[]) => unknown)(...a),
  getClientIdentifier: () => '203.0.113.7',
}));
jest.mock('@/lib/incident-detection', () => ({
  runIncidentDetection: jest.fn(async () => undefined),
  ensureDemoIncidentIfEmpty: jest.fn(async () => undefined),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';

const ADMIN = as('admin-1', 'ADMIN');
const DEALER_A = as('dealer-a', 'DEALER');
const TEAM_MANAGER_CUSTOMER = as('cust-mgr', 'CUSTOMER', { adminTeamRole: 'yonetici' });

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
  setSession(null);
  mockRate.mockClear();
  mockRate.mockImplementation(async () => ({ ok: true, remaining: 10 }));
});

// ───────────────────────────── lib/team-access ─────────────────────────────

describe('requireTeamAccess — yalnız DB rolü (fail-open kapalı)', () => {
  it('çıkarılmış yönetici: JWT hâlâ yonetici diyor, DB null → 403', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: null, adminDepartment: null, role: 'CUSTOMER' });
    const { requireTeamAccess } = await import('@/lib/team-access');
    const r = await requireTeamAccess({ manager: true });
    expect('error' in r && r.error.status).toBe(403);
  });

  it('kullanıcı satırı okunamazsa token rolüne DÜŞMEZ → 403', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue(null);
    const { requireTeamAccess } = await import('@/lib/team-access');
    const r = await requireTeamAccess();
    expect('error' in r && r.error.status).toBe(403);
  });

  it('DB’de üye (uye) yönetici işlemi yapamaz; yonetici yapabilir', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    const { requireTeamAccess } = await import('@/lib/team-access');
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'uye', adminDepartment: null, role: 'CUSTOMER' });
    const r1 = await requireTeamAccess({ manager: true });
    expect('error' in r1 && r1.error.status).toBe(403);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'yonetici', adminDepartment: null, role: 'CUSTOMER' });
    const r2 = await requireTeamAccess({ manager: true });
    expect('session' in r2 && r2.isManager).toBe(true);
  });
});

// ───────────────────────────── /api/admin/team/members ─────────────────────────────

describe('GET /api/admin/team/members — kullanıcı tabanı listelenemez', () => {
  async function search(session: unknown, q: string, dbRole: string, teamRole: string | null) {
    setSession(session);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: teamRole, adminDepartment: null, role: dbRole });
    const { GET } = await import('@/app/api/admin/team/members/route');
    return GET(req(`/api/admin/team/members?q=${encodeURIComponent(q)}`));
  }

  it('CUSTOMER rolündeki ekip yöneticisi boş q ile kimseyi listeleyemez', async () => {
    const data = await (await search(TEAM_MANAGER_CUSTOMER, '', 'CUSTOMER', 'yonetici')).json();
    expect(data.users).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('ADMIN olmayan yönetici kısmi arama yapamaz (yalnız tam e-posta)', async () => {
    const data = await (await search(TEAM_MANAGER_CUSTOMER, 'gmail', 'CUSTOMER', 'yonetici')).json();
    expect(data.users).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('tam e-posta: birebir eşleşme, dönen e-posta yazılanın kendisi, rol alanı yok', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u9', name: 'Zeynep Kaya', image: null });
    const data = await (await search(TEAM_MANAGER_CUSTOMER, 'Zeynep@Ornek.com', 'CUSTOMER', 'yonetici')).json();
    expect(db.user.findFirst.mock.calls[0][0].where.email).toEqual({ equals: 'zeynep@ornek.com', mode: 'insensitive' });
    expect(data.users).toEqual([{ id: 'u9', name: 'Zeynep K.', email: 'zeynep@ornek.com', image: null }]);
  });

  it('ADMIN kısmi arama: en az 3 karakter, en fazla 10 sonuç, rol seçilmez', async () => {
    setSession(ADMIN);
    db.user.findMany.mockResolvedValue([]);
    await search(ADMIN, 'al', 'ADMIN', null);
    expect(db.user.findMany).not.toHaveBeenCalled();
    await search(ADMIN, 'ali', 'ADMIN', null);
    const args = db.user.findMany.mock.calls[0][0];
    expect(args.take).toBeLessThanOrEqual(10);
    expect(args.select.role).toBeUndefined();
  });

  it('rate limit aşılırsa 429', async () => {
    mockRate.mockImplementation(async () => ({ ok: false, remaining: 0, retryAfterMs: 1000 } as never));
    expect((await search(TEAM_MANAGER_CUSTOMER, 'a@b.co', 'CUSTOMER', 'yonetici')).status).toBe(429);
  });

  it('PUT: ekip dışındaki birine id ile rol verilemez → 404', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'yonetici', adminDepartment: null, role: 'CUSTOMER' });
    db.user.findFirst.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/admin/team/members/route');
    const res = await PUT(req('/api/admin/team/members', { method: 'PUT', body: { id: 'victim', teamRole: 'yonetici' } }));
    expect(res.status).toBe(404);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.userDepartment.deleteMany).not.toHaveBeenCalled();
  });

  it('POST: ekleme aramayla aynı rate-limit kovasını paylaşır (404 numaralandırma kanalı) → 429, sorgu yok', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'yonetici', adminDepartment: null, role: 'CUSTOMER' });
    mockRate.mockImplementation(async () => ({ ok: false, remaining: 0, retryAfterMs: 1000 } as never));
    const { POST } = await import('@/app/api/admin/team/members/route');
    const res = await POST(req('/api/admin/team/members', { method: 'POST', body: { email: 'kurban@ornek.com' } }));
    expect(res.status).toBe(429);
    expect((mockRate.mock.calls[0] as unknown[])[0]).toBe('team-member-search:cust-mgr');
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('DELETE: ekip dışındaki bir hesap id ile "çıkarılamaz" → 404, audit yazılmaz', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'yonetici', adminDepartment: null, role: 'CUSTOMER' });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import('@/app/api/admin/team/members/route');
    const res = await DELETE(req('/api/admin/team/members?id=outsider', { method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(db.user.updateMany.mock.calls[0][0].where).toEqual({ id: 'outsider', adminTeamRole: { not: null } });
    expect(db.userDepartment.deleteMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('DELETE: ekip üyesi çıkarılır, departmanları temizlenir, audit yazılır', async () => {
    setSession(TEAM_MANAGER_CUSTOMER);
    db.user.findUnique.mockResolvedValue({ adminTeamRole: 'yonetici', adminDepartment: null, role: 'CUSTOMER' });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    db.userDepartment.deleteMany.mockResolvedValue({ count: 2 });
    db.auditLog.create.mockResolvedValue({});
    const { DELETE } = await import('@/app/api/admin/team/members/route');
    const res = await DELETE(req('/api/admin/team/members?id=member-1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(db.userDepartment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'member-1' } });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────── P0-11: atama ─────────────────────────────

describe('aksiyon maddeleri — assignedToId doğrulaması (P0-11)', () => {
  it('POST: başka kiracının kullanıcısı atanamaz → 400, kayıt yok', async () => {
    setSession(DEALER_A);
    db.dealerStaff.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/dealer/action-items/route');
    const res = await POST(
      req('/api/dealer/action-items', { method: 'POST', body: { suggestionText: 'Servisi hızlandır', assignedToId: 'leaderboard-user' } })
    );
    expect(res.status).toBe(400);
    expect(db.dealerStaff.findFirst.mock.calls[0][0].where).toEqual({
      dealerId: 'dealer-a',
      userId: 'leaderboard-user',
      isActive: true,
    });
    expect(db.actionItem.create).not.toHaveBeenCalled();
  });

  it('POST: aktif personel ya da bayinin kendisi atanabilir', async () => {
    setSession(DEALER_A);
    db.dealerStaff.findFirst.mockResolvedValue({ id: 'ds-1' });
    db.actionItem.findFirst.mockResolvedValue(null);
    db.actionItem.create.mockResolvedValue({ id: 'ai-1' });
    const { POST } = await import('@/app/api/dealer/action-items/route');
    const ok1 = await POST(req('/api/dealer/action-items', { method: 'POST', body: { suggestionText: 'A', assignedToId: 'staff-1' } }));
    expect(ok1.status).toBe(201);
    const ok2 = await POST(req('/api/dealer/action-items', { method: 'POST', body: { suggestionText: 'B', assignedToId: 'dealer-a' } }));
    expect(ok2.status).toBe(201);
  });

  it('PATCH: başka kiracının kullanıcısına yeniden atama → 400', async () => {
    setSession(DEALER_A);
    db.actionItem.findUnique.mockResolvedValue({ dealerId: 'dealer-a' });
    db.dealerStaff.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/dealer/action-items/[id]/route');
    const res = await PATCH(req('/api/dealer/action-items/ai-1', { method: 'PATCH', body: { assignedToId: 'victim' } }), {
      params: Promise.resolve({ id: 'ai-1' }),
    });
    expect(res.status).toBe(400);
    expect(db.actionItem.updateMany).not.toHaveBeenCalled();
  });

  it('GET: atanan kişinin e-postası maskeli döner', async () => {
    setSession(DEALER_A);
    db.actionItem.findMany.mockResolvedValue([
      { id: 'ai-1', assignedTo: { id: 'staff-1', name: null, email: 'mehmet.demir@ornek.com' }, feedback: null },
    ]);
    db.actionItem.count.mockResolvedValue(1);
    const { GET } = await import('@/app/api/dealer/action-items/route');
    const data = await (await GET(req('/api/dealer/action-items'))).json();
    expect(data.items[0].assignedTo.email).not.toContain('mehmet.demir');
    expect(data.items[0].assignedTo.email).toMatch(/\*\*\*/);
  });
});

describe('olaylar — assignedToId doğrulaması + ADMIN hedefi (P0-11)', () => {
  const body = { type: 'manual', severity: 'high', title: 'Puan düşüşü' };

  it('POST: yabancı kullanıcı atanamaz → 400', async () => {
    setSession(DEALER_A);
    db.dealerStaff.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/dealer/incidents/route');
    const res = await POST(req('/api/dealer/incidents', { method: 'POST', body: { ...body, assignedToId: 'victim' } }));
    expect(res.status).toBe(400);
    expect(db.incident.create).not.toHaveBeenCalled();
  });

  it('POST: ADMIN bayi seçmeden olay yazamaz (eski kod kendi id’sine yazıyordu) → 400', async () => {
    setSession(ADMIN);
    const { POST } = await import('@/app/api/dealer/incidents/route');
    expect((await POST(req('/api/dealer/incidents', { method: 'POST', body }))).status).toBe(400);
    expect(db.incident.create).not.toHaveBeenCalled();
  });

  it('GET [id]: atanan e-postası maskeli; başka bayinin olayı 403', async () => {
    setSession(DEALER_A);
    db.incident.findUnique.mockResolvedValue({
      id: 'inc-1',
      dealerId: 'dealer-a',
      assignedTo: { id: 's', name: 'S', email: 'personel@ornek.com' },
      dealer: { id: 'dealer-a', name: 'A', businessName: 'A' },
    });
    const { GET } = await import('@/app/api/dealer/incidents/[id]/route');
    const data = await (await GET(req('/api/dealer/incidents/inc-1'), { params: Promise.resolve({ id: 'inc-1' }) })).json();
    expect(data.assignedTo.email).not.toBe('personel@ornek.com');
    db.incident.findUnique.mockResolvedValue({ id: 'inc-2', dealerId: 'dealer-b', assignedTo: null, dealer: null });
    const res = await GET(req('/api/dealer/incidents/inc-2'), { params: Promise.resolve({ id: 'inc-2' }) });
    expect(res.status).toBe(403);
  });
});
