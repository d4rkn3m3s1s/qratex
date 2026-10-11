/** Segmentler — saf alan mantığı. */
import {
  canTransition,
  defaultMemberSort,
  diffFlags,
  isPublicHttpsUrl,
  largestRemainderPercents,
  maskSecret,
  orderSegments,
  segmentKeyForName,
  validateDecisionNote,
  ageHours,
  sameText,
} from '@/components/admin/a-segmentler/domain';
import { DEFAULT_SEGMENTS } from '@/lib/clv-core';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/dealer-customer-stats', () => ({ recomputeAllDealerCustomerStats: jest.fn() }));

describe('kayıt defteri eşlemesi', () => {
  it('clv-core varsayılan segmentlerinin hepsi bilinen anahtara eşlenir (kural metni kaymaz)', () => {
    for (const s of DEFAULT_SEGMENTS) expect(segmentKeyForName(s.name)).not.toBeNull();
    expect(segmentKeyForName('Özel kampanya')).toBeNull();
  });

  it('kartlar yaşam döngüsü sırasında, sanal kovalar sonda', () => {
    const rows = [
      { id: 'u', key: 'uncomputed', name: 'uncomputed' },
      { id: 'x', key: null, name: 'Özel' },
      { id: 'v', key: 'vip', name: 'VIP' },
      { id: 'n', key: 'none', name: 'none' },
      { id: 'y', key: 'new', name: 'Yeni' },
    ];
    expect(orderSegments(rows).map((r) => r.id)).toEqual(['y', 'v', 'x', 'n', 'u']);
  });
});

describe('yüzde (en büyük kalan)', () => {
  it('toplam her zaman 100', () => {
    for (const counts of [[1, 1, 1], [33, 33, 34], [7, 0, 2, 5], [999, 1]]) {
      expect(largestRemainderPercents(counts).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
  it('boş toplamda hepsi 0', () => {
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('üye varsayılan sıralaması', () => {
  it('risk → kayıp olasılığı azalan; yeni → son alışveriş azalan; VIP → harcama azalan', () => {
    expect(defaultMemberSort('at_risk')).toEqual({ id: 'churn', desc: true });
    expect(defaultMemberSort('new')).toEqual({ id: 'last', desc: true });
    expect(defaultMemberSort('vip')).toEqual({ id: 'spent', desc: true });
  });
});

describe('öneri durum makinesi', () => {
  it('yalnız PENDING → APPROVED|REJECTED ve APPROVED → SENT', () => {
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('PENDING', 'SENT')).toBe(false);
    expect(canTransition('SENT', 'APPROVED')).toBe(false);
    expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
    expect(canTransition('APPROVED', 'SENT')).toBe(true);
  });

  it('ret gerekçesi zorunlu, onay notu isteğe bağlı', () => {
    expect(validateDecisionNote('REJECTED', '')).toEqual({ ok: false, reason: 'required' });
    expect(validateDecisionNote('REJECTED', 'kısa')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateDecisionNote('REJECTED', '  Vaat edilen kod tanımlı değil ')).toEqual({ ok: true, note: 'Vaat edilen kod tanımlı değil' });
    expect(validateDecisionNote('APPROVED', '   ')).toEqual({ ok: true, note: null });
    expect(validateDecisionNote('APPROVED', 'x'.repeat(501))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('bekleme yaşı ve şablon karşılaştırması', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    expect(ageHours('2026-10-09T11:30:00Z', now)).toBe(48);
    expect(sameText('Merhaba   dünya ', 'Merhaba dünya')).toBe(true);
  });
});

describe('modül ayarları', () => {
  it('webhook adresi yalnız herkese açık https', () => {
    expect(isPublicHttpsUrl('https://partner.example.com/hook')).toBe(true);
    expect(isPublicHttpsUrl('http://partner.example.com/hook')).toBe(false);
    expect(isPublicHttpsUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isPublicHttpsUrl('https://10.0.0.5/x')).toBe(false);
    expect(isPublicHttpsUrl('https://192.168.1.1/x')).toBe(false);
    expect(isPublicHttpsUrl('https://localhost/x')).toBe(false);
    expect(isPublicHttpsUrl('https://[::1]/x')).toBe(false);
    expect(isPublicHttpsUrl('https://user:pw@example.com/')).toBe(false);
    expect(isPublicHttpsUrl('nope')).toBe(false);
  });

  it('gizli değer maskelenir', () => {
    expect(maskSecret('')).toEqual({ hasSecret: false, secretLast4: null });
    expect(maskSecret('abcdef0123456789')).toEqual({ hasSecret: true, secretLast4: '6789' });
    expect(maskSecret('short')).toEqual({ hasSecret: true, secretLast4: null });
  });

  it('bayrak farkı', () => {
    expect(diffFlags({ a: true, b: false }, { a: false, b: false })).toEqual([{ key: 'a', from: true, to: false }]);
  });
});
