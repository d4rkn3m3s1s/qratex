/**
 * Veri modeli B14 — 2FA sırrı DB'de mühürlü (AES-256-GCM) saklanır.
 *  - Anahtar varken mühürlenen değer düz sırrı içermez ve doğrulama aynı kodu kabul eder.
 *  - Eski düz metin kayıtlar aynen çalışır (geriye uyum).
 *  - Başka anahtarla mühürlenmiş / bozulmuş kayıt doğrulamayı GEÇEMEZ (fail-closed).
 *  - Anahtar yoksa (yerel) düz saklanır.
 */
import { generateBase32Secret, generateTOTP, openTotpSecret, sealTotpSecret, verifyTOTP } from '@/lib/totp';

const ENV_KEYS = ['TOTP_SECRET_KEY', 'NEXTAUTH_SECRET', 'AUTH_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('2FA sırrı saklama', () => {
  it('anahtar varken mühürler; doğrulama mühürlü değerle çalışır', () => {
    process.env.TOTP_SECRET_KEY = 'test-key-1';
    const plain = generateBase32Secret();
    const stored = sealTotpSecret(plain);
    expect(stored.startsWith('enc:totp:v1:')).toBe(true);
    expect(stored).not.toContain(plain);
    expect(openTotpSecret(stored)).toBe(plain);
    expect(verifyTOTP(stored, generateTOTP(plain))).toBe(true);
  });

  it('eski düz metin kayıt aynen doğrulanır', () => {
    process.env.TOTP_SECRET_KEY = 'test-key-1';
    const plain = generateBase32Secret();
    expect(verifyTOTP(plain, generateTOTP(plain))).toBe(true);
  });

  it('başka anahtarla mühürlenmiş ya da bozuk kayıt geçemez', () => {
    process.env.TOTP_SECRET_KEY = 'test-key-1';
    const plain = generateBase32Secret();
    const stored = sealTotpSecret(plain);
    process.env.TOTP_SECRET_KEY = 'baska-anahtar';
    expect(openTotpSecret(stored)).toBeNull();
    expect(verifyTOTP(stored, generateTOTP(plain))).toBe(false);
    expect(openTotpSecret('enc:totp:v1:bozuk')).toBeNull();
  });

  it('anahtar yoksa düz saklar', () => {
    const plain = generateBase32Secret();
    expect(sealTotpSecret(plain)).toBe(plain);
  });
});
