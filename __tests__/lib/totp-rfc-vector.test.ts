import { base32Decode, generateTOTP } from '@/lib/totp';

describe('TOTP RFC 6238 uyumu', () => {
  it('Base32 secret çözülerek kullanılır (RFC test vektörü)', () => {
    // RFC 6238 Ek B: anahtar "12345678901234567890", T=59 → 94287082 (8 hane) → son 6 hane 287082
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(base32Decode(secret).toString('ascii')).toBe('12345678901234567890');
    jest.useFakeTimers().setSystemTime(59_000);
    try {
      expect(generateTOTP(secret)).toBe('287082');
    } finally {
      jest.useRealTimers();
    }
  });
});
