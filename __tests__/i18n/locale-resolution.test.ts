/**
 * mobil-erisilebilirlik-i18n: dil çözümü (B2), API hata dili (B1), biçimleyiciler (B11),
 * ilk açılış sırası (B6).
 */
import { resolveLocaleChoice } from '@/lib/app-locale';
import { englishErrorMessage, requestLocale } from '@/lib/http/error-locale';
import { ApiError, errorResponse } from '@/lib/http/define-route';
import { getFormatters } from '@/lib/i18n/format';
import { canShowFirstRun, type FirstRunId } from '@/lib/first-run-queue';
import { uiCopy } from '@/lib/i18n/ui-copy';

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/idempotency', () => ({ checkIdempotency: jest.fn(), storeIdempotency: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

describe('resolveLocaleChoice (B2 öncelik: hesap > cihaz > çerez > tr)', () => {
  const base = { cookie: null, fallback: 'tr' as const };

  it('oturum açıkken hesap tercihi, başka kullanıcının cihaz seçimini ezer (paylaşılan cihaz)', () => {
    expect(
      resolveLocaleChoice({ ...base, userId: 'u2', sessionLocale: 'tr', stored: { locale: 'en', owner: 'u1' } }),
    ).toEqual({ locale: 'tr', persist: false });
  });

  it('aynı kullanıcının eski cihaz seçimi başka cihazda değişen hesap tercihini ezmez', () => {
    expect(
      resolveLocaleChoice({ ...base, userId: 'u1', sessionLocale: 'en', stored: { locale: 'tr', owner: 'u1' } }),
    ).toEqual({ locale: 'en', persist: false });
  });

  it('anonimken yapılan seçim girişten sonra hesaba taşınır ve yazılır', () => {
    expect(
      resolveLocaleChoice({ ...base, userId: 'u1', sessionLocale: 'tr', stored: { locale: 'en', owner: '' } }),
    ).toEqual({ locale: 'en', persist: true });
  });

  it('sahipsiz eski kayıt bir kez hesaba taşınır (eski mobil dil düğmesi DB yazmıyordu)', () => {
    expect(
      resolveLocaleChoice({ ...base, userId: 'u1', sessionLocale: 'tr', stored: { locale: 'en', owner: null } }),
    ).toEqual({ locale: 'en', persist: true });
    expect(
      resolveLocaleChoice({ ...base, userId: 'u1', sessionLocale: 'en', stored: { locale: 'en', owner: null } }),
    ).toEqual({ locale: 'en', persist: false });
  });

  it('anonim: cihaz seçimi > çerez > varsayılan', () => {
    expect(resolveLocaleChoice({ userId: null, sessionLocale: null, stored: { locale: 'en', owner: '' }, cookie: 'tr', fallback: 'tr' }).locale).toBe('en');
    expect(resolveLocaleChoice({ userId: null, sessionLocale: null, stored: null, cookie: 'en', fallback: 'tr' }).locale).toBe('en');
    expect(resolveLocaleChoice({ userId: null, sessionLocale: null, stored: null, cookie: null, fallback: 'tr' }).locale).toBe('tr');
  });
});

describe('API hata dili (B1)', () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it('dil çerezi > Accept-Language > tr', () => {
    expect(requestLocale(headers({ cookie: 'a=1; qratex-locale=en' }))).toBe('en');
    expect(requestLocale(headers({ cookie: 'qratex-locale=tr', 'accept-language': 'en-US,en;q=0.9' }))).toBe('tr');
    expect(requestLocale(headers({ 'accept-language': 'en-GB,en;q=0.9,tr;q=0.8' }))).toBe('en');
    expect(requestLocale(headers({ 'accept-language': 'tr-TR,tr;q=0.9' }))).toBe('tr');
    expect(requestLocale(null)).toBe('tr');
  });

  it('EN istekte özel Türkçe mesaj yerine messageEn ya da kodun genel metni', async () => {
    const tr = await errorResponse(new ApiError('NOT_FOUND', 'Kart bulunamadı'), 'r1').json();
    expect(tr.error).toBe('Kart bulunamadı');
    expect(tr.code).toBe('NOT_FOUND');

    const en = await errorResponse(new ApiError('NOT_FOUND', 'Kart bulunamadı'), 'r2', 'en').json();
    expect(en.error).toBe('The record was not found.');
    expect(en.message).toBe(en.error);
    expect(en.code).toBe('NOT_FOUND');

    const custom = await errorResponse(new ApiError('CONFLICT', 'Zaten alındı', { messageEn: 'Already claimed' }), 'r3', 'en').json();
    expect(custom.error).toBe('Already claimed');
  });

  it('tanınmayan kodda duruma göre genel metin', () => {
    expect(englishErrorMessage('CARD_GONE', 404)).toBe('The record was not found.');
    expect(englishErrorMessage('WHATEVER', 500)).toMatch(/unexpected/i);
  });
});

describe('getFormatters (B11)', () => {
  it('dilde ayraç ve çoğul', () => {
    expect(getFormatters('tr').number(12345)).toBe('12.345');
    expect(getFormatters('en').number(12345)).toBe('12,345');
    expect(getFormatters('en').plural(1, { one: '# day', other: '# days' })).toBe('1 day');
    expect(getFormatters('en').plural(3, { one: '# day', other: '# days' })).toBe('3 days');
    expect(getFormatters('tr').tag).toBe('tr-TR');
    expect(getFormatters('en')).toBe(getFormatters('en'));
  });

  it('göreli zaman dilde', () => {
    const now = Date.UTC(2026, 9, 11, 12, 0, 0);
    expect(getFormatters('en').relative(now - 3 * 86400_000, now)).toBe('3 days ago');
    expect(getFormatters('tr').relative(now - 3 * 86400_000, now)).toBe('3 gün önce');
  });
});

describe('ilk açılış sırası (B6)', () => {
  const state = (entries: Array<[FirstRunId, 'pending' | 'want' | 'skip' | 'done']>) => new Map(entries);

  it('karar vermemiş önceki katman arkadakini bekletir', () => {
    expect(canShowFirstRun('onboarding', state([['welcome-video', 'pending'], ['onboarding', 'want']]))).toBe(false);
  });

  it('önceki katman istemiyor ya da kapandıysa sıradaki açılır', () => {
    expect(canShowFirstRun('onboarding', state([['welcome-video', 'skip'], ['onboarding', 'want']]))).toBe(true);
    expect(canShowFirstRun('birthday', state([['welcome-video', 'done'], ['onboarding', 'done'], ['birthday', 'want']]))).toBe(true);
  });

  it('aynı anda iki katman açılmaz', () => {
    const s = state([['welcome-video', 'want'], ['onboarding', 'want'], ['birthday', 'want']]);
    expect(['welcome-video', 'onboarding', 'birthday'].filter((id) => canShowFirstRun(id as FirstRunId, s))).toEqual(['welcome-video']);
  });

  it('kayıtlı olmayan katman (ör. bayi panelinde video yok) kimseyi bekletmez', () => {
    expect(canShowFirstRun('onboarding', state([['onboarding', 'want']]))).toBe(true);
  });
});

describe('uiCopy', () => {
  it('iki dil aynı anahtarlara sahip', () => {
    expect(Object.keys(uiCopy('en')).sort()).toEqual(Object.keys(uiCopy('tr')).sort());
    expect(uiCopy('en').closeEscape).toBe('Close (Escape)');
    expect(uiCopy(undefined).closeEscape).toBe('Kapat (Escape)');
  });
});
