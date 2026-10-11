/**
 * /auth/staff-invite — hesap açma doğrulaması kayıt / sıfırlama ile AYNI şifre politikasını
 * kullanır (eskiden yerel regex: 128 üst sınırı yoktu, hata tek genel satırdı ve alana bağlı değildi).
 */
import { validateInviteSignup } from '@/app/(auth)/auth/staff-invite/validate';
import { passwordPolicyError } from '@/components/auth/p-auth/password-policy';

describe('validateInviteSignup', () => {
  it('geçerli girdi → hata yok', () => {
    expect(validateInviteSignup({ name: 'Ali Veli', password: 'Guclu1Sifre', confirm: 'Guclu1Sifre' })).toEqual({});
  });

  it('kısa ad alanına bağlanır', () => {
    expect(validateInviteSignup({ name: ' A ', password: 'Guclu1Sifre', confirm: 'Guclu1Sifre' }).name).toBeTruthy();
  });

  it.each(['kisa1A', 'tumukucuk1', 'TUMUBUYUK1', 'HarfSadece'])('politikayı karşılamayan şifre reddedilir: %s', (pw) => {
    const errs = validateInviteSignup({ name: 'Ali', password: pw, confirm: pw });
    expect(errs.password).toBeTruthy();
    expect(passwordPolicyError(pw)).toBe('WEAK_PASSWORD');
  });

  it('128 karakter üstü ayrı mesajla reddedilir (sunucu politikasıyla aynı sınır)', () => {
    const long = `Aa1${'x'.repeat(130)}`;
    const errs = validateInviteSignup({ name: 'Ali', password: long, confirm: long });
    expect(errs.password).toMatch(/128/);
    expect(passwordPolicyError(long)).toBe('PASSWORD_TOO_LONG');
  });

  it('eşleşmeyen tekrar yalnız tekrar alanına bağlanır', () => {
    const errs = validateInviteSignup({ name: 'Ali', password: 'Guclu1Sifre', confirm: 'Guclu1Sifr' });
    expect(errs).toEqual({ confirm: expect.any(String) });
  });
});
