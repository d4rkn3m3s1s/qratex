/**
 * İstanbul dönem/kova anahtarları + değişim (trends bulgu 3/4, analytics bulgu 1/2) ve
 * yolculuk akışı imleci (journey-score bulgu 7).
 */
import { bucketKey, changeOf, fillSeries, parseProgressPeriod, periodWindow } from '@/components/customer/m-ben-ilerleme/period';
import { compareDesc, decodeCursor, encodeCursor, mergeJourney } from '@/components/customer/m-ben-ilerleme/journey-cursor';

describe('periodWindow', () => {
  const now = new Date('2026-10-10T22:30:00Z'); // İstanbul 11 Ekim 01:30

  it('gün sınırı İstanbul: UTC 22:30 ertesi güne aittir', () => {
    const w = periodWindow(7, now);
    expect(w.toDay).toBe('2026-10-11');
    expect(w.fromDay).toBe('2026-10-05');
    expect(w.keys).toHaveLength(7);
    expect(w.from.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(w.prevFrom.toISOString()).toBe('2026-09-27T21:00:00.000Z');
  });

  it('30 gün günlük, 90 gün haftalık (Pazartesi), 365 gün aylık kova', () => {
    expect(periodWindow(30, now).keys).toHaveLength(30);
    const w90 = periodWindow(90, now);
    expect(w90.unit).toBe('week');
    for (const k of w90.keys) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(1);
    const w365 = periodWindow(365, now);
    expect(w365.unit).toBe('month');
    expect(w365.keys[w365.keys.length - 1]).toBe('2026-10-01');
    expect(w365.keys.length).toBeGreaterThanOrEqual(12);
    expect(w365.keys.every((k) => k.endsWith('-01'))).toBe(true);
  });

  it('kova anahtarı İstanbul takvimi (UTC değil)', () => {
    expect(bucketKey(new Date('2026-10-10T22:30:00Z'), 'day')).toBe('2026-10-11');
    expect(bucketKey(new Date('2026-10-10T22:30:00Z'), 'week')).toBe('2026-10-05');
    expect(bucketKey(new Date('2026-09-30T21:30:00Z'), 'month')).toBe('2026-10-01');
  });

  it('geçersiz dönem 30 güne düşer', () => {
    expect(parseProgressPeriod('45')).toBe(30);
    expect(parseProgressPeriod(['90'])).toBe(90);
    expect(parseProgressPeriod(undefined)).toBe(30);
  });
});

describe('changeOf / fillSeries', () => {
  it('önceki 0 ise yüzde YOK ("++100%" hatası kapanır)', () => {
    expect(changeOf(3, 0)).toEqual({ kind: 'new' });
    expect(changeOf(0, 0)).toEqual({ kind: 'none' });
    expect(changeOf(15, 10)).toEqual({ kind: 'pct', value: 50 });
    expect(changeOf(5, 10)).toEqual({ kind: 'pct', value: -50 });
  });

  it('boş kovalar 0 ile dolar, yinelenen anahtarlar toplanır', () => {
    expect(fillSeries(['a', 'b', 'c'], [{ k: 'c', n: 2 }, { k: 'a', n: 1 }, { k: 'c', n: 1 }])).toEqual([1, 0, 3]);
  });
});

describe('journey cursor', () => {
  const ev = (at: string, key: string) => ({ at, key });

  it('imleç kodla/çöz; bozuk imleç null', () => {
    const c = { at: '2026-10-01T10:00:00.000Z', key: 'fb:abc' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('bozuk')).toBeNull();
    expect(decodeCursor(123)).toBeNull();
  });

  it('kaynaklar (at desc, key desc) ile birleşir', () => {
    const a = [ev('2026-10-05T00:00:00Z', 'fb:2'), ev('2026-10-01T00:00:00Z', 'fb:1')];
    const b = [ev('2026-10-03T00:00:00Z', 'ub:9')];
    const { items, nextCursor } = mergeJourney([a, b], null, 10, 15);
    expect(items.map((i) => i.key)).toEqual(['fb:2', 'ub:9', 'fb:1']);
    expect(nextCursor).toBeNull();
  });

  it('aynı milisaniyedeki olaylar sayfa sınırında atlanmaz ve tekrarlanmaz', () => {
    const t = '2026-10-05T00:00:00.000Z';
    const all = [ev(t, 'ub:3'), ev(t, 'fb:9'), ev(t, 'cs:5'), ev('2026-10-04T00:00:00.000Z', 'cs:1')].sort(compareDesc);
    const page1 = mergeJourney([all], null, 2, 2);
    expect(page1.items.map((i) => i.key)).toEqual(['ub:3', 'fb:9']);
    expect(page1.nextCursor).not.toBeNull();
    const cursor = decodeCursor(page1.nextCursor)!;
    // Sunucu "at ≤ imleç" ile okur → sınırdaki üç olay yeniden gelir, imleç filtresi ayıklar.
    const page2 = mergeJourney([all.filter((x) => Date.parse(x.at) <= Date.parse(cursor.at))], cursor, 2, 5);
    expect(page2.items.map((i) => i.key)).toEqual(['cs:5', 'cs:1']);
    const seen = [...page1.items, ...page2.items].map((i) => i.key);
    expect(new Set(seen).size).toBe(4);
  });
});
