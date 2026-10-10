/**
 * Proxy yardımcıları — P0-01 (sayfa + /api/admin kapısı) ve P0-36 (tarama sayfalarında kamera).
 */
import { webcrypto } from 'crypto';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
process.env.NEXTAUTH_SECRET = 'test-secret-edge';

const redisValue: { v: unknown } = { v: null };
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => redisValue.v) }));

import {
  checkGateCookieForToken,
  isCameraRoute,
  isGateExemptApiPath,
  isGatedAdminPage,
  permissionsPolicyFor,
} from '@/lib/admin-gate-edge';
import { signElevation } from '@/lib/admin-elevation';

describe('kapı kapsamı', () => {
  it('yalnız kapı ucu ve ekip modülü muaf', () => {
    expect(isGateExemptApiPath('/api/admin/gate')).toBe(true);
    expect(isGateExemptApiPath('/api/admin/gate/')).toBe(true);
    expect(isGateExemptApiPath('/api/admin/team/tasks')).toBe(true);
    expect(isGateExemptApiPath('/api/admin/settings/admin-gate')).toBe(false);
    expect(isGateExemptApiPath('/api/admin/gatekeeper')).toBe(false);
    expect(isGateExemptApiPath('/api/admin/teamwork')).toBe(false);
    expect(isGateExemptApiPath('/api/admin/users')).toBe(false);
  });

  it('kapı sayfaları: /admin ve altı, /admin-gate hariç', () => {
    expect(isGatedAdminPage('/admin')).toBe(true);
    expect(isGatedAdminPage('/admin/users')).toBe(true);
    expect(isGatedAdminPage('/admin-gate')).toBe(false);
    expect(isGatedAdminPage('/administrator')).toBe(false);
  });
});

describe('checkGateCookieForToken (proxy)', () => {
  const token = { id: 'a1', jti: 'j1', role: 'ADMIN' };

  it('SALDIRI: elle yazılmış sahte çerez reddedilir (eski proxy biçime bakıp geçiriyordu)', async () => {
    redisValue.v = null;
    const r = await checkGateCookieForToken(`a1.${'f'.repeat(64)}`, token);
    expect(r.ok).toBe(false);
  });

  it('geçerli çerez; Redis\'te yayınlı sürüm değişince reddedilir', async () => {
    const c = await signElevation({ userId: 'a1', cfgVer: 1, jti: 'j1' });
    redisValue.v = null;
    expect((await checkGateCookieForToken(c, token)).ok).toBe(true);
    redisValue.v = { cfgVer: 1 };
    expect((await checkGateCookieForToken(c, token)).ok).toBe(true);
    redisValue.v = { cfgVer: 2 };
    expect((await checkGateCookieForToken(c, token)).ok).toBe(false);
  });

  it('token sub alanıyla da çalışır; başka oturumun çerezi reddedilir', async () => {
    redisValue.v = null;
    const c = await signElevation({ userId: 'a1', cfgVer: 0, jti: 'j1' });
    expect((await checkGateCookieForToken(c, { sub: 'a1', jti: 'j1' })).ok).toBe(true);
    expect((await checkGateCookieForToken(c, { sub: 'a1', jti: 'j2' })).ok).toBe(false);
    expect((await checkGateCookieForToken(c, null)).ok).toBe(false);
  });
});

describe('Permissions-Policy (P0-36)', () => {
  it('tarama sayfalarında camera=(self)', () => {
    expect(isCameraRoute('/dealer/scan')).toBe(true);
    expect(isCameraRoute('/customer/scan')).toBe(true);
    expect(permissionsPolicyFor('/dealer/scan')).toContain('camera=(self)');
    expect(permissionsPolicyFor('/customer/scan/abc')).toContain('camera=(self)');
  });

  it('diğer her yerde kamera kapalı', () => {
    expect(permissionsPolicyFor('/dealer')).toContain('camera=()');
    expect(permissionsPolicyFor('/dealer/scanner-settings')).toContain('camera=()');
    expect(permissionsPolicyFor('/api/dealer/scan')).toContain('camera=()');
    expect(permissionsPolicyFor('/admin')).toMatch(/^camera=\(\), microphone=\(\)/);
  });
});
