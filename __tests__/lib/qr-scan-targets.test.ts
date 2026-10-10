import { extractCardToken, extractFeedbackCode } from '@/lib/qr-scan-targets';

describe('extractCardToken', () => {
  it('kart URL’sinden ve düz token’dan çıkarır', () => {
    expect(extractCardToken('https://qratex.app/c/AbC_12-x')).toBe('AbC_12-x');
    expect(extractCardToken('https://qratex.app/c/AbC123?ref=qr')).toBe('AbC123');
    expect(extractCardToken('/c/tok')).toBe('tok');
    expect(extractCardToken('  RAWTOKEN  ')).toBe('RAWTOKEN');
  });

  it('anlamsız içerikte null döner (API isteği atılmaz)', () => {
    expect(extractCardToken('')).toBeNull();
    expect(extractCardToken('   ')).toBeNull();
    expect(extractCardToken('https://example.com/some page')).toBeNull();
    expect(extractCardToken('x'.repeat(200))).toBeNull();
  });
});

describe('extractFeedbackCode', () => {
  it('geri bildirim URL’sinden ve düz koddan çıkarır', () => {
    expect(extractFeedbackCode('https://qratex.app/feedback/AB12CD34')).toBe('AB12CD34');
    expect(extractFeedbackCode('https://qratex.app/feedback/AB12CD34?utm_source=table')).toBe('AB12CD34');
    expect(extractFeedbackCode('AB12CD34')).toBe('AB12CD34');
  });

  it('rastgele bir URL’nin son 8 karakterini kod sanmaz (eski davranış)', () => {
    expect(extractFeedbackCode('https://instagram.com/qratexofficial')).toBeNull();
    expect(extractFeedbackCode('WIFI:S:Kafe;T:WPA;P:12345678;;')).toBeNull();
    expect(extractFeedbackCode('ab')).toBeNull();
  });
});
