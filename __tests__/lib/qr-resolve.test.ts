/**
 * lib/qr-resolve — evrensel QR çözücü (saf).
 * B-6: tanınmayan QR'lar artık "son 8 karakter" ile koda çevrilmez.
 */
import { cardHref, feedbackHref, parseQrPayload, qrCodeCandidates } from '@/lib/qr-resolve';

describe('parseQrPayload', () => {
  it('geri bildirim bağlantısı (tam URL, alan adsız, sorgulu)', () => {
    expect(parseQrPayload('https://qratex.com/feedback/AB12CD34')).toEqual({ kind: 'feedback', code: 'AB12CD34' });
    expect(parseQrPayload('qratex.com/feedback/AB12CD34?utm_source=table')).toEqual({ kind: 'feedback', code: 'AB12CD34' });
    expect(parseQrPayload('  /feedback/DEMO-CAFE-001#x ')).toEqual({ kind: 'feedback', code: 'DEMO-CAFE-001' });
  });

  it('kart bağlantısı', () => {
    expect(parseQrPayload('https://qratex.com/c/Ab3dEf9hJk2mNp4qRs6tU')).toEqual({ kind: 'card', token: 'Ab3dEf9hJk2mNp4qRs6tU' });
    expect(parseQrPayload('https://qratex.com/c/BATCH_Ab3dEf9hJk2mNp4qRs6tU/')).toEqual({
      kind: 'card',
      token: 'BATCH_Ab3dEf9hJk2mNp4qRs6tU',
    });
  });

  it('düz kod → plain (QR mu kart mı sunucu karar verir)', () => {
    expect(parseQrPayload('AB12CD34')).toEqual({ kind: 'plain', value: 'AB12CD34' });
    expect(parseQrPayload('ab12cd34')).toEqual({ kind: 'plain', value: 'ab12cd34' });
  });

  it('alakasız QR içerikleri unknown (istek atılmaz)', () => {
    expect(parseQrPayload('https://instagram.com/somevenue')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('https://menu.example.com/menu/123')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('WIFI:S:Kafe;T:WPA;P:12345678;;')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('BEGIN:VCARD')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('merhaba dünya')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('abc')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload(undefined)).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('x'.repeat(3000))).toEqual({ kind: 'unknown' });
  });

  it('kısa/geçersiz geri bildirim kodu unknown', () => {
    expect(parseQrPayload('https://qratex.com/feedback/ab')).toEqual({ kind: 'unknown' });
    expect(parseQrPayload('https://qratex.com/c/ab')).toEqual({ kind: 'unknown' });
  });
});

describe('qrCodeCandidates', () => {
  it('yazıldığı gibi, sonra büyük harf', () => {
    expect(qrCodeCandidates('ab12cd34')).toEqual(['ab12cd34', 'AB12CD34']);
    expect(qrCodeCandidates('AB12CD34')).toEqual(['AB12CD34']);
    expect(qrCodeCandidates('x'.repeat(100))).toEqual([]);
  });
});

describe('yol yardımcıları', () => {
  it('atıf kaynağı sorguya eklenir', () => {
    expect(feedbackHref('AB12CD34', 'camera')).toBe('/feedback/AB12CD34?src=in_app_camera');
    expect(feedbackHref('AB12CD34')).toBe('/feedback/AB12CD34');
    expect(cardHref('Ab3d_x')).toBe('/c/Ab3d_x');
  });
});
