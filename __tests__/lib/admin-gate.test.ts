/**
 * Admin gizli kapı — HMAC cookie güvenliği + normalize. Cookie'yi client SAHTELEYEMEMELİ
 * (secret'ı bilmeden imza üretemez); cevap değişince eski cookie'ler GEÇERSİZLEŞMELİ;
 * başka kullanıcının cookie'si REDDEDİLMELİ. normalize cevabı tek rakama zorlar.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-abc';
import {
  normalizeAdminGate,
  makeGateCookieValue,
  verifyGateCookie,
  DEFAULT_ADMIN_GATE,
} from '@/lib/admin-gate';
import { gateCookieBelongsTo } from '@/lib/admin-gate-edge';

describe('normalizeAdminGate', () => {
  it('geçerli soru + tek-rakam cevap kabul edilir', () => {
    expect(normalizeAdminGate({ question: 'Kaç boyut?', answer: '3' })).toEqual({ question: 'Kaç boyut?', answer: '3' });
  });

  it('çok haneli/harf cevap → varsayılana düşer', () => {
    expect(normalizeAdminGate({ question: 'X', answer: '42' }).answer).toBe(DEFAULT_ADMIN_GATE.answer);
    expect(normalizeAdminGate({ question: 'X', answer: 'a' }).answer).toBe(DEFAULT_ADMIN_GATE.answer);
    expect(normalizeAdminGate({ question: 'X', answer: '' }).answer).toBe(DEFAULT_ADMIN_GATE.answer);
  });

  it('boş/bozuk girdi → tam varsayılan', () => {
    expect(normalizeAdminGate(null)).toEqual(DEFAULT_ADMIN_GATE);
    expect(normalizeAdminGate('nope')).toEqual(DEFAULT_ADMIN_GATE);
    expect(normalizeAdminGate([1, 2])).toEqual(DEFAULT_ADMIN_GATE);
  });
});

describe('HMAC cookie', () => {
  it('doğru userId + answer → geçerli', () => {
    const c = makeGateCookieValue('user-1', '7');
    expect(verifyGateCookie(c, 'user-1', '7')).toBe(true);
  });

  it('cevap değişince eski cookie GEÇERSİZ (yeniden doğrulama)', () => {
    const c = makeGateCookieValue('user-1', '7');
    expect(verifyGateCookie(c, 'user-1', '8')).toBe(false);
  });

  it('başka kullanıcının cookie\'si REDDEDİLİR', () => {
    const c = makeGateCookieValue('user-1', '7');
    expect(verifyGateCookie(c, 'user-2', '7')).toBe(false);
  });

  it('sahte/bozuk cookie reddedilir', () => {
    expect(verifyGateCookie('sahte.value', 'user-1', '7')).toBe(false);
    expect(verifyGateCookie('', 'user-1', '7')).toBe(false);
    expect(verifyGateCookie(undefined, 'user-1', '7')).toBe(false);
  });
});

describe('gateCookieBelongsTo (edge/proxy hafif kontrol)', () => {
  it('doğru userId + geçerli hmac formatı → true', () => {
    const c = makeGateCookieValue('user-1', '7'); // "user-1.<64hex>"
    expect(gateCookieBelongsTo(c, 'user-1')).toBe(true);
  });

  it('başka userId → false', () => {
    const c = makeGateCookieValue('user-1', '7');
    expect(gateCookieBelongsTo(c, 'user-2')).toBe(false);
  });

  it('bozuk format (hmac yok / kısa) → false', () => {
    expect(gateCookieBelongsTo('user-1.kısa', 'user-1')).toBe(false);
    expect(gateCookieBelongsTo('user-1', 'user-1')).toBe(false);
    expect(gateCookieBelongsTo('.abc', 'user-1')).toBe(false);
    expect(gateCookieBelongsTo(undefined, 'user-1')).toBe(false);
  });
});
