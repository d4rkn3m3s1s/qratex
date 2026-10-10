/** Kasa + İşlem defteri saf mantığı (lib/dealer/kasa/core.ts). */
import {
  VOID_WINDOW_MS,
  buildSummary,
  classifyReplay,
  csvCell,
  enqueue,
  extractReceiptTotal,
  istanbulDayKey,
  ledgerFiltersToParams,
  maskCustomerName,
  parseAmountInput,
  parseLedgerFilters,
  pctDelta,
  previousWindow,
  resolveLedgerWindow,
  sanitizeQueue,
  voidBlockReason,
} from '@/lib/dealer/kasa/core';

describe('parseLedgerFilters', () => {
  it('geçersiz değerler varsayılana düşer, kısa arama yok sayılır', () => {
    const f = parseLedgerFilters(new URLSearchParams('range=bogus&rating=x&sort=y&page=-3&q=a&product=../x'));
    expect(f).toMatchObject({ range: '30d', rating: 'all', sort: 'new', page: 1, q: '', productId: null });
  });
  it('özel aralık: tersine tarihler düzeltilir, geçersiz tarih 30 güne düşer', () => {
    expect(parseLedgerFilters({ range: 'custom', from: '2026-10-10', to: '2026-10-01' })).toMatchObject({
      range: 'custom',
      from: '2026-10-01',
      to: '2026-10-10',
    });
    expect(parseLedgerFilters({ range: 'custom', from: '2026-02-30', to: '2026-03-01' }).range).toBe('30d');
  });
  it('URL gidiş-dönüş: varsayılanlar yazılmaz', () => {
    const f = parseLedgerFilters(new URLSearchParams('range=7d&rating=low&q=latte&page=2'));
    expect(ledgerFiltersToParams(f).toString()).toBe('range=7d&rating=low&q=latte&page=2');
    expect(ledgerFiltersToParams(parseLedgerFilters({})).toString()).toBe('');
  });
});

describe('İstanbul pencereleri', () => {
  const now = new Date('2026-10-11T22:30:00Z'); // İstanbul: 12 Ekim 01:30
  it('gün anahtarı İstanbul saatine göre', () => {
    expect(istanbulDayKey(now)).toBe('2026-10-12');
  });
  it('bugün = İstanbul gece yarısından ertesi gece yarısına', () => {
    const w = resolveLedgerWindow({ range: 'today', from: null, to: null }, now);
    expect(w.from?.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-12T21:00:00.000Z');
  });
  it('7 gün + önceki eşit dönem', () => {
    const w = resolveLedgerWindow({ range: '7d', from: null, to: null }, now);
    expect(w.from?.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    const p = previousWindow(w)!;
    expect(p.to.toISOString()).toBe(w.from!.toISOString());
    expect(p.from!.toISOString()).toBe('2026-09-28T21:00:00.000Z');
    expect(previousWindow(resolveLedgerWindow({ range: 'all', from: null, to: null }, now))).toBeNull();
  });
});

describe('özet', () => {
  it('ortalama yalnız tutarlı kayıtlardan, oranlar yüzde; sıfıra bölme yok', () => {
    const s = buildSummary({ count: 4, revenue: 300, amountCount: 3, reviewed: 1, customerCounts: [2, 1, 1] });
    expect(s).toEqual({ count: 4, revenue: 300, avgBasket: 100, reviewed: 1, reviewRate: 25, uniqueCustomers: 3, repeatRate: 33.3 });
    const e = buildSummary({ count: 0, revenue: null, amountCount: 0, reviewed: 0, customerCounts: [] });
    expect(e).toMatchObject({ avgBasket: null, reviewRate: null, repeatRate: null, revenue: 0 });
  });
  it('önceki 0 ise değişim uydurulmaz', () => {
    expect(pctDelta(10, 0)).toBeNull();
    expect(pctDelta(15, 10)).toBe(50);
  });
});

describe('maskeleme ve geri alma', () => {
  it('ad maskelenir', () => {
    expect(maskCustomerName('Ayşe Kaya İnce')).toBe('Ayşe İ.');
    expect(maskCustomerName('  ')).toBeNull();
    expect(maskCustomerName('Can')).toBe('Can');
  });
  it('15 dk penceresi ve değerlendirme kilidi', () => {
    const now = new Date('2026-10-11T10:00:00Z');
    expect(voidBlockReason({ createdAt: new Date(now.getTime() - VOID_WINDOW_MS + 1000), hasReview: false, now })).toBeNull();
    expect(voidBlockReason({ createdAt: new Date(now.getTime() - VOID_WINDOW_MS - 1), hasReview: false, now })).toBe('window');
    expect(voidBlockReason({ createdAt: now, hasReview: true, now })).toBe('reviewed');
  });
});

describe('tutar girişi ve fiş OCR', () => {
  it.each([
    ['1.250', 1250],
    ['1.250,50', 1250.5],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['1,234.56', 1234.56],
    ['₺ 45', 45],
    ['', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmountInput(raw)).toBe(expected);
  });
  it('geçersiz/negatif/üst sınır NaN', () => {
    expect(parseAmountInput('abc')).toBeNaN();
    expect(parseAmountInput('-5')).toBeNaN();
    expect(parseAmountInput('2000000')).toBeNaN();
  });
  it('TOPLAM satırındaki TR binlik doğru okunur (1.250 → 1250, eskiden 1,25)', () => {
    expect(extractReceiptTotal('KDV 18,00\nTOPLAM *1.250\nNAKIT 1.300')).toBe(1250);
    expect(extractReceiptTotal('Latte 85,00\nKurabiye 40,00')).toBe(85);
    expect(extractReceiptTotal('')).toBeNull();
  });
});

describe('CSV', () => {
  it('formül enjeksiyonu nötrlenir, ayraç/tırnak kaçışı', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(null)).toBe('');
  });
});

describe('çevrimdışı kuyruk', () => {
  const item = {
    clientOpId: 'kasa:abcdef12',
    cardToken: 'tok',
    customerLabel: 'Ayşe K.',
    productId: null,
    productName: null,
    amount: 10,
    note: null,
    queuedAt: 1,
  };
  it('aynı işlem kimliği iki kez kuyruğa girmez', () => {
    expect(enqueue(enqueue([], item), item)).toHaveLength(1);
  });
  it('yanıt sınıflaması: 2xx bitti, ağ/429/5xx sonra, diğer 4xx kalıcı ret', () => {
    expect(classifyReplay(200)).toBe('done');
    expect(classifyReplay(null)).toBe('retry-later');
    expect(classifyReplay(429)).toBe('retry-later');
    expect(classifyReplay(503)).toBe('retry-later');
    expect(classifyReplay(403)).toBe('rejected');
    expect(classifyReplay(404)).toBe('rejected');
  });
  it('bozuk/elle değiştirilmiş depolama temizlenir', () => {
    const out = sanitizeQueue([item, { clientOpId: 'x', cardToken: 't' }, { ...item, clientOpId: 'kasa:zzzzzzzz', amount: -5 }, 'junk']);
    expect(out).toHaveLength(2);
    expect(out[1].amount).toBeNull();
  });
});
