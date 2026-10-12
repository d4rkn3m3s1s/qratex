/**
 * Personel defter kapsamı (lib/dealer/kasa/staff-scope.server) + zorunlu admin 2FA kararı
 * (lib/auth/admin-2fa). Prisma/Redis mock; gerçek DB'ye gidilmez.
 */
const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
const mockIncr = jest.fn();
jest.mock('@/lib/redis', () => ({ redisIncrWithTtl: (...a: unknown[]) => mockIncr(...a) }));

import { parseLedgerFilters, scopeLedgerFilters, parseStaffLedgerScope } from '@/lib/dealer/kasa/core';
import { getStaffLedgerScope, resolveStaffLedgerAccess, staffLedgerScopeWhere } from '@/lib/dealer/kasa/staff-scope.server';
import { adminNeeds2faSetup, decideAdmin2fa, isSetupPath } from '@/lib/auth/admin-2fa';

const NOW = new Date('2026-10-11T10:00:00Z');
const TODAY_START = new Date('2026-10-11T00:00:00+03:00');

beforeEach(() => {
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  mockIncr.mockReset();
});

describe('scopeLedgerFilters + politika', () => {
  const all = parseLedgerFilters(new URLSearchParams('range=all'));
  it('politika yoksa / today → bugüne kilitli', () => {
    expect(scopeLedgerFilters(all, 'staff').range).toBe('today');
    expect(scopeLedgerFilters(all, 'staff', 'today').range).toBe('today');
  });
  it('today_own ve all aralığı korur (kısıt where ile)', () => {
    expect(scopeLedgerFilters(all, 'staff', 'today_own').range).toBe('all');
    expect(scopeLedgerFilters(all, 'staff', 'all').range).toBe('all');
  });
  it('parse yalnız bilinen değerleri kabul eder', () => {
    expect(parseStaffLedgerScope('all')).toBe('all');
    expect(parseStaffLedgerScope('everything')).toBeNull();
  });
});

describe('staffLedgerScopeWhere', () => {
  it('today_own → bugün VEYA kendi kayıtları', async () => {
    mockPrisma.cardAuditLog = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ metadata: { consumptionId: 'c1' } }, { metadata: {} }, { metadata: { consumptionId: 'c2' } }]),
    };
    const w = await staffLedgerScopeWhere('today_own', 'staff_1', NOW);
    expect(w).toEqual({ OR: [{ createdAt: { gte: TODAY_START } }, { id: { in: ['c1', 'c2'] } }] });
    expect(mockPrisma.cardAuditLog.findMany.mock.calls[0][0].where).toEqual({ userId: 'staff_1', action: 'CONSUMPTION_ADDED' });
  });
  it('today_own, kendi kaydı yoksa yalnız bugün', async () => {
    mockPrisma.cardAuditLog = { findMany: jest.fn().mockResolvedValue([]) };
    expect(await staffLedgerScopeWhere('today_own', 's', NOW)).toEqual({ createdAt: { gte: TODAY_START } });
  });
  it('today → bugün, all → kısıt yok', async () => {
    expect(await staffLedgerScopeWhere('today', 's', NOW)).toEqual({ createdAt: { gte: TODAY_START } });
    expect(await staffLedgerScopeWhere('all', 's', NOW)).toBeNull();
  });
});

describe('getStaffLedgerScope / resolveStaffLedgerAccess', () => {
  it('ayar yok/bozuk/hata → varsayılan today_own', async () => {
    mockPrisma.settings = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ value: { scope: 'x' } })
        .mockRejectedValueOnce(new Error('db')),
    };
    expect(await getStaffLedgerScope('d1')).toBe('today_own');
    expect(await getStaffLedgerScope('d1')).toBe('today_own');
    expect(await getStaffLedgerScope('d1')).toBe('today_own');
  });
  it('kayıtlı ayarı okur; personel olmayan için kısıt yok', async () => {
    mockPrisma.settings = { findUnique: jest.fn().mockResolvedValue({ value: { scope: 'all' } }) };
    expect(await resolveStaffLedgerAccess({ dealerId: 'd1', actorId: 's1', via: 'staff' }, NOW)).toEqual({ policy: 'all', scopeWhere: null });
    expect(await resolveStaffLedgerAccess({ dealerId: 'd1', actorId: 'd1', via: 'self' }, NOW)).toEqual({ policy: null, scopeWhere: null });
    expect(mockPrisma.settings.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('zorunlu admin 2FA', () => {
  const base = { twoFactorEnabled: false, twoFactorSecret: null, isDemo: false, email: 'boss@firma.com' };
  it('karar tablosu', () => {
    expect(decideAdmin2fa({ ...base, twoFactorEnabled: true, twoFactorSecret: 'enc' }, {})).toBe('ok');
    expect(decideAdmin2fa(base, {})).toBe('setup_required');
    expect(decideAdmin2fa({ ...base, email: 'Admin@Qratex.com' }, {})).toBe('exempt_demo');
    expect(decideAdmin2fa({ ...base, isDemo: true }, {})).toBe('exempt_demo');
    expect(decideAdmin2fa(base, { ADMIN_2FA_BREAK_GLASS: '1' })).toBe('break_glass');
    expect(decideAdmin2fa(base, { ADMIN_2FA_BREAK_GLASS: 'true' })).toBe('setup_required');
    expect(decideAdmin2fa({ ...base, email: 'admin@qratex.com' }, { ADMIN_2FA_EXEMPT_EMAILS: '' })).toBe('setup_required');
  });
  it('kurulum sayfası döngüye girmez', async () => {
    expect(isSetupPath('/admin/account-security')).toBe(true);
    expect(isSetupPath('/admin/account-securityX')).toBe(false);
    mockPrisma.user = { findUnique: jest.fn() };
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin/account-security' })).toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('2FA yoksa yönlendir; DB hatasında fail-open', async () => {
    mockPrisma.user = { findUnique: jest.fn().mockResolvedValueOnce(base).mockRejectedValueOnce(new Error('db')) };
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin' })).toBe(true);
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin' })).toBe(false);
    err.mockRestore();
  });
  it('break-glass: geçer + oturum başına denetim kaydı', async () => {
    const prev = process.env.ADMIN_2FA_BREAK_GLASS;
    process.env.ADMIN_2FA_BREAK_GLASS = '1';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPrisma.user = { findUnique: jest.fn().mockResolvedValue(base) };
    mockPrisma.auditLog = { create: jest.fn().mockResolvedValue({}) };
    mockIncr
      .mockResolvedValueOnce({ count: 1, ttlMs: 1 })
      .mockResolvedValueOnce({ count: 2, ttlMs: 1 })
      .mockResolvedValueOnce(null);
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin' })).toBe(false);
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin/x' })).toBe(false);
    expect(await adminNeeds2faSetup('u1', { sid: 's', pathname: '/admin/y' })).toBe(false);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2); // ilk + Redis yokken
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ADMIN_2FA_BREAK_GLASS_USED');
    warn.mockRestore();
    if (prev === undefined) delete process.env.ADMIN_2FA_BREAK_GLASS;
    else process.env.ADMIN_2FA_BREAK_GLASS = prev;
  });
});
