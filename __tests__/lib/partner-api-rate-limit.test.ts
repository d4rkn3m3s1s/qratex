/**
 * Partner API anahtarı başına oran sınırı (mimari-api B13): sınır aşılınca 429 + Retry-After,
 * sayaç altyapısı çökerse istek kesilmez (fail-open). Prisma/Redis mock'lanır.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/redis', () => ({
  redisIncrWithTtl: jest.fn().mockResolvedValue(null),
  redisGetJson: jest.fn().mockResolvedValue(null),
  isRedisConfigured: jest.fn().mockReturnValue(false),
}));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn().mockResolvedValue({}) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  PARTNER_RATE_LIMIT_PER_MINUTE,
  authenticatePartnerApiKey,
  partnerAuthFailure,
} from '@/lib/partner-api-auth';

const raw = 'qrx_testtesttesttesttest';

beforeEach(() => {
  resetDb();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  db.apiKey.findFirst.mockResolvedValue({ id: 'k1', scope: { v: 2, scopes: ['*'] } });
  db.apiKey.update.mockResolvedValue({});
});

describe('partner API oran sınırı', () => {
  it('anahtar başına kova ile sayar; sınır içinde geçer', async () => {
    (checkRateLimitDb as jest.Mock).mockResolvedValue({ ok: true });
    const r = await authenticatePartnerApiKey(`Bearer ${raw}`);
    expect(r).toMatchObject({ ok: true, apiKeyId: 'k1' });
    expect(checkRateLimitDb).toHaveBeenCalledWith('partner-api:k1', PARTNER_RATE_LIMIT_PER_MINUTE, 60_000);
  });

  it('sınır aşılınca 429 + Retry-After, zarf v2 alanları', async () => {
    (checkRateLimitDb as jest.Mock).mockResolvedValue({ ok: false, retryAfterMs: 12_300 });
    const r = await authenticatePartnerApiKey(`Bearer ${raw}`);
    expect(r).toMatchObject({ ok: false, status: 429, retryAfterSec: 13 });
    if (r.ok) throw new Error('beklenmedik');
    const res = partnerAuthFailure(r);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('13');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    await expect(res.json()).resolves.toMatchObject({ success: false, code: 'RATE_LIMITED', retryable: true });
  });

  it('sayaç altyapısı çökerse istek kesilmez (fail-open)', async () => {
    (checkRateLimitDb as jest.Mock).mockRejectedValue(new Error('redis yok'));
    await expect(authenticatePartnerApiKey(`Bearer ${raw}`)).resolves.toMatchObject({ ok: true });
  });

  it('401 hatası kodlu ve Retry-After başlıksız', async () => {
    const res = partnerAuthFailure({ ok: false, status: 401, error: 'Geçersiz API anahtarı' });
    expect(res.status).toBe(401);
    expect(res.headers.get('Retry-After')).toBeNull();
    await expect(res.json()).resolves.toMatchObject({ code: 'UNAUTHENTICATED', error: 'Geçersiz API anahtarı' });
  });
});
