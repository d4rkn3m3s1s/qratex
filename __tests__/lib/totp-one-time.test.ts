/**
 * guvenlik-admin-api B15 — TOTP kodu girişte TEK KULLANIMLIK (aynı zaman adımı ikinci kez reddedilir).
 */
const mockFindUnique = jest.fn();
const mockRecovery = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    twoFactorRecoveryCode: { updateMany: (...a: unknown[]) => mockRecovery(...a) },
  },
}));
const used = new Map<string, number>();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: async (bucket: string, max: number) => {
    const n = (used.get(bucket) ?? 0) + 1;
    used.set(bucket, n);
    return { ok: n <= max };
  },
}));

import { generateTOTP, generateBase32Secret, verifyTOTPStep } from '@/lib/totp';
import { verifyTwoFactorForLogin } from '@/lib/two-factor';

const secret = generateBase32Secret();

beforeEach(() => {
  used.clear();
  mockFindUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorSecret: secret });
  mockRecovery.mockResolvedValue({ count: 0 });
});

describe('TOTP tek kullanım', () => {
  it('verifyTOTPStep geçerli kodda zaman adımını, geçersizde null döndürür', () => {
    expect(typeof verifyTOTPStep(secret, generateTOTP(secret))).toBe('number');
    expect(verifyTOTPStep(secret, 'abc')).toBeNull();
  });

  it('aynı kod ilk girişte kabul, ikinci girişte (pencere içinde) RED', async () => {
    const code = generateTOTP(secret);
    expect(await verifyTwoFactorForLogin('u1', code)).toBe(true);
    expect(await verifyTwoFactorForLogin('u1', code)).toBe(false);
  });

  it('kullanım işareti kullanıcıya bağlı (başka hesap etkilenmez)', async () => {
    const code = generateTOTP(secret);
    expect(await verifyTwoFactorForLogin('u1', code)).toBe(true);
    expect(await verifyTwoFactorForLogin('u2', code)).toBe(true);
  });
});
