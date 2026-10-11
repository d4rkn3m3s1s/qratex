/**
 * Güvenlik incelemesi — hesap kilitleme DoS'u: hesap düzeyi (tüm IP'ler) artık sert kilit
 * değil, üstel gecikme. Sert kilit yalnız ip:e-posta bileşiminde.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
// @auth/prisma-adapter ESM yayınlanıyor (ts-jest dönüştürmez); bu test yalnız saf yardımcıyı ölçer.
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: jest.fn(() => ({})) }));
import { readFileSync } from 'fs';
import { join } from 'path';
import { accountBackoffMs } from '@/lib/auth';

describe('accountBackoffMs', () => {
  it('eşik altı gecikmesiz, üstü üstel ve tavanlı', () => {
    expect(accountBackoffMs(0)).toBe(0);
    expect(accountBackoffMs(10)).toBe(0);
    expect(accountBackoffMs(11)).toBe(250);
    expect(accountBackoffMs(12)).toBe(500);
    expect(accountBackoffMs(13)).toBe(1000);
    expect(accountBackoffMs(1000)).toBe(4000);
  });

  it('kaynakta hesap bazlı SERT kilit yok; IP genel sınırı var', () => {
    const src = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8');
    expect(src).not.toMatch(/ACCOUNT_LOGIN_LOCKOUT/);
    expect(src).not.toMatch(/getLoginLockoutDb\(accountLockKey/);
    expect(src).toMatch(/login_ip:\$\{ip\}/);
  });
});
