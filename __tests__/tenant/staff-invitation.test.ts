/**
 * P0-04 — "Personel ekle" ile hesap ele geçirme. Saldırı senaryosu:
 *   1. Saldırgan bayi hesabı açar (kayıt herkese açık).
 *   2. `POST /api/dealer/staff { email: kurban@…, password: 'Saldirgan1' }`.
 *   3. Eski kod kurbanın şifresini ve rolünü EZİYORDU.
 * Yeni davranış: var olan hiçbir kullanıcıya yazılmaz; yalnız davet oluşur. Kabul yalnız davet
 * e-postasının sahibi tarafından, ADMIN/DEALER asla dönüştürülmeden yapılır.
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
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })),
  getClientIdentifier: () => '203.0.113.7',
}));
const mockSend = jest.fn(async () => ({ ok: true }));
jest.mock('@/lib/mail-sender', () => ({
  isMailConfigured: () => true,
  sendTransactionalEmail: (...a: unknown[]) => (mockSend as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('@/lib/password', () => ({ hashPassword: jest.fn(async (p: string) => `hashed:${p}`) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';
import {
  acceptStaffInvitation,
  createStaffInvitation,
  hashInviteToken,
  isAcceptablePassword,
} from '@/lib/staff-invitations';

const DEALER_A = as('dealer-a', 'DEALER');
const TOKEN = 'tok_'.padEnd(40, 'x');
const NOW = new Date('2026-10-08T10:00:00Z');

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    dealerId: 'dealer-a',
    email: 'kurban@ornek.com',
    role: 'STAFF',
    jobTitle: 'Garson',
    expiresAt: new Date('2026-10-15T10:00:00Z'),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetDb();
  setSession(null);
  mockSend.mockClear();
});

describe('POST /api/dealer/staff — davet akışı (var olan hesaba DOKUNMAZ)', () => {
  async function post(body: unknown) {
    setSession(DEALER_A);
    const { POST } = await import('@/app/api/dealer/staff/route');
    return POST(
      new NextRequest('http://localhost/api/dealer/staff', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', host: 'qratex.test' },
      })
    );
  }

  it('kayıtlı e-postayla şifre gönderilse bile hiçbir kullanıcı satırı güncellenmez/oluşturulmaz', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'bayi@ornek.com', businessName: 'Kafe A', name: 'A' });
    db.dealerStaff.findFirst.mockResolvedValue(null);
    db.staffInvitation.updateMany.mockResolvedValue({ count: 0 });
    db.staffInvitation.create.mockResolvedValue({
      id: 'inv-1',
      email: 'kurban@ornek.com',
      jobTitle: null,
      expiresAt: NOW,
      createdAt: NOW,
    });
    db.auditLog.create.mockResolvedValue({});

    const res = await post({ name: 'Ele Geçir', email: 'Kurban@Ornek.com', password: 'Saldirgan1', pinCode: '1234' });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, invited: true, emailSent: true });

    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.dealerStaff.create).not.toHaveBeenCalled();
    // Davet e-postası normalize edilmiş adrese; şifre hiçbir yere yazılmaz.
    const created = db.staffInvitation.create.mock.calls[0][0].data;
    expect(created.email).toBe('kurban@ornek.com');
    expect(JSON.stringify(created)).not.toContain('Saldirgan1');
    expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // Bağlantı yalnız e-postada; yanıtta token yok.
    expect(JSON.stringify(data)).not.toContain(created.tokenHash);
    const mail = (mockSend.mock.calls[0] as unknown as [{ to: string; html: string }])[0];
    expect(mail.to).toBe('kurban@ornek.com');
    expect(mail.html).toContain('/auth/staff-invite?token=');
  });

  it('yanıt hedef hesabın varlığını/rolünü açıklamaz (numaralandırma yok)', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'bayi@ornek.com', businessName: 'Kafe A', name: 'A' });
    db.dealerStaff.findFirst.mockResolvedValue(null);
    db.staffInvitation.updateMany.mockResolvedValue({ count: 0 });
    db.staffInvitation.create.mockResolvedValue({ id: 'i', email: 'admin@qratex.com', jobTitle: null, expiresAt: NOW, createdAt: NOW });
    db.auditLog.create.mockResolvedValue({});
    const res = await post({ email: 'admin@qratex.com' });
    expect(res.status).toBe(201);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('kendini davet edemez; zaten ekipteki kişi 409', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'bayi@ornek.com' });
    expect((await post({ email: 'BAYI@ornek.com' })).status).toBe(400);
    db.dealerStaff.findFirst.mockResolvedValue({ id: 'ds' });
    expect((await post({ email: 'personel@ornek.com' })).status).toBe(409);
  });

  it('bayi e-postasındaki HTML kaçışlanır (işletme adı enjeksiyonu yok)', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'bayi@ornek.com', businessName: '<img src=x onerror=alert(1)>', name: 'A' });
    db.dealerStaff.findFirst.mockResolvedValue(null);
    db.staffInvitation.updateMany.mockResolvedValue({ count: 0 });
    db.staffInvitation.create.mockResolvedValue({ id: 'i', email: 'k@ornek.com', jobTitle: null, expiresAt: NOW, createdAt: NOW });
    db.auditLog.create.mockResolvedValue({});
    await post({ email: 'k@ornek.com' });
    const mail = (mockSend.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(mail.html).not.toContain('<img src=x');
  });
});

describe('createStaffInvitation', () => {
  it('aynı kişiye bekleyen eski davet iptal edilir (tek geçerli bağlantı)', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'bayi@ornek.com' });
    db.dealerStaff.findFirst.mockResolvedValue(null);
    db.staffInvitation.updateMany.mockResolvedValue({ count: 1 });
    db.staffInvitation.create.mockResolvedValue({ id: 'inv-2', email: 'k@ornek.com', jobTitle: null, expiresAt: NOW, createdAt: NOW });
    const r = await createStaffInvitation({ dealerId: 'dealer-a', invitedById: 'dealer-a', email: 'k@ornek.com', now: NOW });
    expect(r.ok).toBe(true);
    expect(db.staffInvitation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { dealerId: 'dealer-a', email: 'k@ornek.com', acceptedAt: null, revokedAt: null },
      data: { revokedAt: NOW },
    });
    if (r.ok) expect(hashInviteToken(r.plainToken)).toBe(db.staffInvitation.create.mock.calls[0][0].data.tokenHash);
  });
});

describe('acceptStaffInvitation', () => {
  beforeEach(() => {
    db.staffInvitation.findUnique.mockResolvedValue(invitation());
    db.staffInvitation.updateMany.mockResolvedValue({ count: 1 });
    db.staffInvitation.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it.each(['ADMIN', 'DEALER'])('%s hesabı personele DÖNÜŞTÜRÜLEMEZ → 409', async (role) => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'kurban@ornek.com', role });
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: 'u1', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'ROLE_NOT_CONVERTIBLE' });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.staffInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('başka hesapla oturum açmış biri daveti kabul edemez → 403', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'saldirgan', email: 'saldirgan@ornek.com', role: 'CUSTOMER' });
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: 'saldirgan', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 403, code: 'EMAIL_MISMATCH' });
  });

  it('oturumsuz + hesap zaten var → giriş zorunlu (şifre/rol yazılmaz)', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'kurban' });
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: null, name: 'X', password: 'Saldirgan1', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 401, code: 'LOGIN_REQUIRED' });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('oturumsuz yeni kişi: KENDİ şifresiyle hesap açılır, STAFF + bağ yazılır', async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: 'new-user' });
    db.dealerStaff.findUnique.mockResolvedValue(null);
    db.dealerStaff.create.mockResolvedValue({});
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: null, name: 'Ali Veli', password: 'GucluSifre1', now: NOW });
    expect(r).toMatchObject({ ok: true, userId: 'new-user', createdAccount: true });
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({
      email: 'kurban@ornek.com',
      password: 'hashed:GucluSifre1',
      role: 'STAFF',
    });
    expect(db.dealerStaff.create.mock.calls[0][0].data).toMatchObject({ dealerId: 'dealer-a', userId: 'new-user' });
  });

  it('zayıf şifre → 400', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: null, name: 'Ali', password: 'kisa', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(isAcceptablePassword('GucluSifre1')).toBe(true);
    expect(isAcceptablePassword('guclusifre1')).toBe(false);
  });

  it('müşteri kendi daveti: rol STAFF olur ve oturum sürümü artar (eski token düşer)', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: 'cust-1', email: 'KURBAN@ornek.com', role: 'CUSTOMER' })
      .mockResolvedValueOnce({ role: 'CUSTOMER' });
    db.dealerStaff.findUnique.mockResolvedValue(null);
    db.dealerStaff.create.mockResolvedValue({});
    db.user.update.mockResolvedValue({});
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: 'cust-1', now: NOW });
    expect(r).toMatchObject({ ok: true, requiresReLogin: true });
    expect(db.user.update.mock.calls[0][0]).toEqual({
      where: { id: 'cust-1' },
      data: { role: 'STAFF', sessionVersion: { increment: 1 } },
    });
    // Şifreye ve ada DOKUNULMAZ.
    expect(JSON.stringify(db.user.update.mock.calls[0][0].data)).not.toContain('password');
  });

  it('başka işletmede aktif personel → 409', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: 's1', email: 'kurban@ornek.com', role: 'STAFF' })
      .mockResolvedValueOnce({ role: 'STAFF' });
    db.dealerStaff.findUnique.mockResolvedValue({ id: 'ds', dealerId: 'dealer-b', isActive: true });
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: 's1', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'ALREADY_STAFF_ELSEWHERE' });
  });

  it('eşzamanlı ikinci kabul: koşullu tüketim 0 satır → 410', async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.staffInvitation.updateMany.mockResolvedValue({ count: 0 });
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: null, name: 'Ali Veli', password: 'GucluSifre1', now: NOW });
    expect(r).toMatchObject({ ok: false, status: 410, code: 'INVITE_USED' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['süresi dolmuş', { expiresAt: new Date('2026-10-01T00:00:00Z') }, 'INVITE_EXPIRED'],
    ['iptal edilmiş', { revokedAt: NOW }, 'INVITE_REVOKED'],
    ['kullanılmış', { acceptedAt: NOW }, 'INVITE_USED'],
  ])('%s davet → 410', async (_l, over, code) => {
    db.staffInvitation.findUnique.mockResolvedValue(invitation(over));
    const r = await acceptStaffInvitation({ plainToken: TOKEN, sessionUserId: null, now: NOW });
    expect(r).toMatchObject({ ok: false, status: 410, code });
  });
});
