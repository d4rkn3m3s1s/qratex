/**
 * Güvenlik regresyonu (commit güvenlik incelemesi):
 *  - POST /api/admin/users ADMIN rolüyle hesap OLUŞTURAMAZ (dört göz atlatması).
 *  - PUT /api/admin/users başka yöneticinin e-postasını değiştiremez (hesap ele geçirme).
 *  - Toplu rol değişikliği yalnız DEALER/CUSTOMER kaynak rollerine dokunur (ADMIN düşürme yok).
 *  - VoC duvarı: modül kapısı/yapılandırma hatası fail-closed; ad maskeleme fail-closed.
 */
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'cadmin00000000000000000a', role: 'ADMIN' } } })),
}));
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: jest.fn(async () => undefined) }));
jest.mock('@/lib/gdpr-core', () => ({ anonymizeUser: jest.fn() }));
jest.mock('@/lib/data-safety/user-erasure', () => ({ previewUserErasure: jest.fn() }));
jest.mock('@/lib/economy', () => ({ adjustPointsByAdmin: jest.fn(), isEconomyError: () => false, ADMIN_ADJUST_LIMITS: { perOperation: 100000, reasonMin: 3, reasonMax: 500 } }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({}) }));
jest.mock('@/lib/admin-users/actions.server', () => ({
  actionCtx: jest.fn(), checkRoleChange: jest.fn(), grantReward: jest.fn(), revokeBadge: jest.fn(), sendDirectNotification: jest.fn(),
}));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => { throw new Error('db down'); }) }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(async () => []), updateMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    auditLog: { create: jest.fn(async () => ({})) },
    settings: { findUnique: jest.fn(async () => { throw new Error('db down'); }) },
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST as createUser, PUT as updateUser } from '@/app/api/admin/users/route';
import { POST as bulk } from '@/app/api/admin/users/bulk/route';
import { getWallConfig, isWallModuleEnabled, wallDisplayName } from '@/lib/dealer/voc-wall/server';

const p = prisma as unknown as {
  user: Record<string, jest.Mock>;
};
const req = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('admin users yetki sertleştirmesi', () => {
  it('ADMIN rolüyle doğrudan kullanıcı oluşturmayı reddeder', async () => {
    const res = await createUser(req('http://x/api/admin/users', 'POST', { name: 'Ev', email: 'e@x.com', password: '12345678', role: 'ADMIN' }));
    expect(res.status).toBe(403);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it('başka yöneticinin e-postasını değiştirmeyi reddeder', async () => {
    p.user.findUnique.mockResolvedValueOnce({ id: 'cother0000000000000000000', role: 'ADMIN', email: 'a@x.com', anonymizedAt: null });
    const res = await updateUser(req('http://x/api/admin/users?id=cother0000000000000000000', 'PUT', { email: 'evil@x.com' }));
    expect(res.status).toBe(403);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it('toplu rol değişikliği yalnız DEALER/CUSTOMER kaynaklarını ve anonim olmayanları seçer', async () => {
    p.user.findMany.mockResolvedValueOnce([]);
    const res = await bulk(req('http://x/api/admin/users/bulk', 'POST', { action: 'update_role', userIds: ['cother0000000000000000000'], role: 'CUSTOMER' }));
    expect(res.status).toBe(200);
    const where = p.user.findMany.mock.calls[0][0].where;
    expect(where.role.in).toEqual(['DEALER', 'CUSTOMER']);
    expect(where.anonymizedAt).toBeNull();
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('VoC duvarı fail-closed', () => {
  it('modül kapısı okunamazsa ekran kapalı', async () => {
    await expect(isWallModuleEnabled()).resolves.toBe(false);
  });
  it('yapılandırma okunamazsa varsayılana (boş gizli listesi) düşmez', async () => {
    await expect(getWallConfig('cdealer000000000000000000')).rejects.toThrow('db down');
  });
  it('ad olmayan tanımlayıcıları göstermez, gerçek adı maskeler', () => {
    const rules = { nameDisplay: 'masked' } as never;
    expect(wallDisplayName({ name: 'ahmet@x.com', anonymizedAt: null }, rules)).toBeNull();
    expect(wallDisplayName({ name: 'Ayşe Yılmaz', anonymizedAt: null }, rules)).not.toContain('Yılmaz');
    expect(wallDisplayName({ name: 'Ayşe Yılmaz', anonymizedAt: new Date() }, rules)).toBeNull();
  });
});
