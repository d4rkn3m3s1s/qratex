/**
 * env-validation: saf doğrulama çekirdeği testleri.
 */
import { validateEnv } from '@/lib/env-validation';

const GOOD_SECRET = 'x'.repeat(40);

describe('validateEnv', () => {
  it('eksik DATABASE_URL hata üretir', () => {
    const r = validateEnv({ NEXTAUTH_SECRET: GOOD_SECRET }, true);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.key === 'DATABASE_URL' && i.level === 'error')).toBe(true);
  });

  it('postgres olmayan DATABASE_URL uyarı verir (hata değil)', () => {
    const r = validateEnv({ DATABASE_URL: 'mysql://x', NEXTAUTH_SECRET: GOOD_SECRET }, true);
    expect(r.issues.some((i) => i.key === 'DATABASE_URL' && i.level === 'warn')).toBe(true);
    // mysql uyarısı tek başına ok'u bozmaz (yalnızca error bozar)
  });

  it('üretimde NEXTAUTH_SECRET zorunlu', () => {
    const r = validateEnv({ DATABASE_URL: 'postgresql://x' }, true);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.key === 'NEXTAUTH_SECRET' && i.level === 'error')).toBe(true);
  });

  it('üretimde kısa NEXTAUTH_SECRET hata', () => {
    const r = validateEnv({ DATABASE_URL: 'postgresql://x', NEXTAUTH_SECRET: 'short' }, true);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.key === 'NEXTAUTH_SECRET' && i.level === 'error')).toBe(true);
  });

  it('geliştirmede kısa secret yalnızca uyarı (ok bozulmaz)', () => {
    const r = validateEnv({ DATABASE_URL: 'postgresql://x', NEXTAUTH_SECRET: 'short' }, false);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.key === 'NEXTAUTH_SECRET' && i.level === 'warn')).toBe(true);
  });

  it('yarım Google OAuth uyarı verir', () => {
    const r = validateEnv(
      { DATABASE_URL: 'postgresql://x', NEXTAUTH_SECRET: GOOD_SECRET, NEXTAUTH_URL: 'https://x', GOOGLE_CLIENT_ID: 'id' },
      true
    );
    expect(r.issues.some((i) => i.key === 'GOOGLE_CLIENT_ID' && i.level === 'warn')).toBe(true);
  });

  it('tam ve geçerli yapılandırma ok=true, hata yok', () => {
    const r = validateEnv(
      {
        DATABASE_URL: 'postgresql://user:pass@host/db',
        NEXTAUTH_SECRET: GOOD_SECRET,
        NEXTAUTH_URL: 'https://app.example',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
      },
      true
    );
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });
});
