/**
 * Tek yeniden deneme politikası + devre kesici (denetim Y3/Y6).
 * Redis yok (örnek-içi yol); zamanlayıcılar sahte.
 */
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
  redisIncrWithTtl: jest.fn(async () => null),
}));

import {
  AI_CIRCUIT_POLICY,
  AiProviderUnavailableError,
  __resetAiCircuitForTests,
  isAiCircuitOpen,
  isProviderFailure,
  isRetryableAiError,
  retryAfterMsOf,
  withAiRetry,
} from '@/lib/ai-provider-resilience';
import { redisSetJson } from '@/lib/redis';

function apiError(status: number, headers: Record<string, string> = {}) {
  return Object.assign(new Error(`${status} error`), { status, headers });
}

beforeEach(() => {
  __resetAiCircuitForTests();
  jest.clearAllMocks();
});

describe('hata sınıflandırma', () => {
  it('yalnız 429 yeniden denenir; 400/401 sağlayıcı arızası sayılmaz', () => {
    expect(isRetryableAiError(apiError(429))).toBe(true);
    expect(isRetryableAiError(apiError(500))).toBe(false);
    expect(isProviderFailure(apiError(503))).toBe(true);
    expect(isProviderFailure(apiError(429))).toBe(true);
    expect(isProviderFailure(apiError(400))).toBe(false);
    expect(isProviderFailure(apiError(401))).toBe(false);
    expect(isProviderFailure(Object.assign(new Error('t'), { name: 'APIConnectionTimeoutError' }))).toBe(true);
  });

  it('Retry-After saniye / ms / HTTP tarihi okunur', () => {
    expect(retryAfterMsOf(apiError(429, { 'retry-after': '2' }))).toBe(2000);
    expect(retryAfterMsOf(apiError(429, { 'retry-after-ms': '350' }))).toBe(350);
    const now = Date.parse('2026-10-11T10:00:00Z');
    expect(retryAfterMsOf(apiError(429, { 'retry-after': 'Sun, 11 Oct 2026 10:00:03 GMT' }), now)).toBe(3000);
    expect(retryAfterMsOf(apiError(429))).toBeNull();
  });
});

describe('withAiRetry', () => {
  it('429 sonrası Retry-After kadar bekleyip başarır', async () => {
    jest.useFakeTimers();
    const fn = jest.fn().mockRejectedValueOnce(apiError(429, { 'retry-after-ms': '500' })).mockResolvedValueOnce('ok');
    const p = withAiRetry(fn, { provider: 'p1' });
    await jest.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('sağlayıcı bütçeden uzun bekleme isterse hiç beklemeden hata döner', async () => {
    const fn = jest.fn().mockRejectedValue(apiError(429, { 'retry-after': '120' }));
    await expect(withAiRetry(fn, { provider: 'p2' })).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('istemci hatası (400) yeniden denenmez', async () => {
    const fn = jest.fn().mockRejectedValue(apiError(400));
    await expect(withAiRetry(fn, { provider: 'p3' })).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await isAiCircuitOpen('p3')).toBe(false);
  });

  it('eşik kadar ardışık 5xx → devre açılır, sonraki çağrı sağlayıcıya GİTMEZ', async () => {
    const fn = jest.fn().mockRejectedValue(apiError(503));
    for (let i = 0; i < AI_CIRCUIT_POLICY.failureThreshold; i++) {
      await expect(withAiRetry(fn, { provider: 'p4' })).rejects.toMatchObject({ status: 503 });
    }
    expect(await isAiCircuitOpen('p4')).toBe(true);
    expect(redisSetJson).toHaveBeenCalledWith('ai:cb:open:p4', expect.any(Number), 60);

    const probe = jest.fn().mockResolvedValue('x');
    await expect(withAiRetry(probe, { provider: 'p4' })).rejects.toBeInstanceOf(AiProviderUnavailableError);
    expect(probe).not.toHaveBeenCalled();
    // Başka sağlayıcının devresi etkilenmez.
    expect(await isAiCircuitOpen('p5')).toBe(false);
  });

  it('araya giren başarı arıza penceresini sıfırlar', async () => {
    const bad = jest.fn().mockRejectedValue(apiError(500));
    const good = jest.fn().mockResolvedValue('ok');
    for (let i = 0; i < AI_CIRCUIT_POLICY.failureThreshold - 1; i++) {
      await expect(withAiRetry(bad, { provider: 'p6' })).rejects.toBeTruthy();
    }
    await withAiRetry(good, { provider: 'p6' });
    await expect(withAiRetry(bad, { provider: 'p6' })).rejects.toBeTruthy();
    expect(await isAiCircuitOpen('p6')).toBe(false);
  });
});
