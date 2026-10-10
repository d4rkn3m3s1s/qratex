/**
 * Mekân detayı saf mantığı (lib/venue-detail): ziyaret günü tekilleştirme (İstanbul günü),
 * ziyaret kartı/kademe, medyan yanıt süresi, geçmiş birleştirme/sayfalama, konu süzme,
 * paylaşım notu şablonu. DB yok.
 */
import { medianHours, stampCard, summarizeVisits, visitTier, istanbulDayKey } from '@/lib/venue-detail/visits';
import { excerpt, mergeHistory, normalizeTopics, parseCursor } from '@/lib/venue-detail/history';
import type { VenueHistoryItem } from '@/lib/venue-detail/types';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

describe('summarizeVisits — gün tekil, Europe/Istanbul', () => {
  it('aynı gündeki tüketim + geri bildirim tek ziyaret sayılır (eski çift sayım düzeldi)', () => {
    const s = summarizeVisits([
      new Date('2026-10-01T09:00:00Z'),
      new Date('2026-10-01T15:00:00Z'),
      new Date('2026-10-03T10:00:00Z'),
    ]);
    expect(s.days).toBe(2);
    expect(s.firstVisitAt?.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    expect(s.lastVisitAt?.toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });

  it('UTC gece yarısından önce ama İstanbul’da ertesi gün olan an ayrı gün sayılır', () => {
    // 21:30Z = İstanbul 00:30 (ertesi gün)
    expect(istanbulDayKey(new Date('2026-10-01T21:30:00Z'))).toBe('2026-10-02');
    const s = summarizeVisits([new Date('2026-10-01T20:00:00Z'), new Date('2026-10-01T21:30:00Z')]);
    expect(s.days).toBe(2);
  });

  it('boş girdi', () => {
    expect(summarizeVisits([])).toEqual({ days: 0, firstVisitAt: null, lastVisitAt: null });
  });
});

describe('stampCard / visitTier', () => {
  it('0 ziyaret → boş kart', () => {
    expect(stampCard(0)).toEqual({ perCard: 10, filled: 0, completedCards: 0, toFull: 10 });
  });
  it('10. ziyarette kart dolu görünür, 11. ziyaret yeni kartı başlatır', () => {
    expect(stampCard(10)).toEqual({ perCard: 10, filled: 10, completedCards: 1, toFull: 0 });
    expect(stampCard(11)).toEqual({ perCard: 10, filled: 1, completedCards: 1, toFull: 9 });
    expect(stampCard(23)).toMatchObject({ filled: 3, completedCards: 2 });
  });
  it('kademe yalnız ziyaret gününden türer; ödül alanı yok', () => {
    expect(visitTier(0)).toEqual({ current: null, next: 'first', nextAt: 1 });
    expect(visitTier(3)).toEqual({ current: 'familiar', next: 'regular', nextAt: 10 });
    expect(visitTier(40)).toEqual({ current: 'insider', next: null, nextAt: null });
  });
});

describe('medianHours', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, 0) + h * 3_600_000);
  it('örneklem 3’ün altındaysa null (uydurma süre yok)', () => {
    expect(medianHours([{ createdAt: at(0), repliedAt: at(2) }])).toBeNull();
  });
  it('tek/çift örneklem medyanı; yanıtsız ve ters zamanlı kayıtlar atlanır', () => {
    expect(
      medianHours([
        { createdAt: at(0), repliedAt: at(1) },
        { createdAt: at(0), repliedAt: at(5) },
        { createdAt: at(0), repliedAt: at(30) },
        { createdAt: at(0), repliedAt: null },
        { createdAt: at(10), repliedAt: at(1) },
      ])
    ).toEqual({ hours: 5, sample: 3 });
    expect(
      medianHours([
        { createdAt: at(0), repliedAt: at(2) },
        { createdAt: at(0), repliedAt: at(4) },
        { createdAt: at(0), repliedAt: at(6) },
        { createdAt: at(0), repliedAt: at(8) },
      ])
    ).toEqual({ hours: 5, sample: 4 });
  });
});

describe('geçmiş birleştirme', () => {
  const fb = (id: string, at: string): VenueHistoryItem => ({
    kind: 'feedback', id, at, rating: 5, excerpt: null, topics: [], dealerReply: null, dealerRepliedAt: null,
  });
  const cs = (id: string, at: string): VenueHistoryItem => ({
    kind: 'consumption', id, at, productName: null, amount: null, review: null,
  });

  it('iki kaynağı yeniden eskiye sıralar, take kadar döner ve imleç verir', () => {
    const page = mergeHistory(
      [cs('c1', '2026-10-05T10:00:00.000Z'), fb('f1', '2026-10-06T10:00:00.000Z'), cs('c2', '2026-10-01T10:00:00.000Z')],
      2
    );
    expect(page.items.map((i) => i.id)).toEqual(['f1', 'c1']);
    expect(page.nextCursor).toBe('2026-10-05T10:00:00.000Z');
  });
  it('fazlası yoksa imleç null', () => {
    expect(mergeHistory([fb('f1', '2026-10-06T10:00:00.000Z')], 10).nextCursor).toBeNull();
  });
  it('geçersiz imleç yok sayılır', () => {
    expect(parseCursor('dün')).toBeNull();
    expect(parseCursor('2026-10-05T10:00:00.000Z')?.toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });
  it('konu anahtarları bilinen kümeye süzülür (ham metin etiket olmaz), en çok 3', () => {
    expect(normalizeTopics(['Service', 'xyz', 'quality', 'price', 'staff'])).toEqual(['service', 'quality', 'price']);
    expect(normalizeTopics('service')).toEqual([]);
  });
  it('alıntı kırpılır', () => {
    expect(excerpt('  a   b  ')).toBe('a b');
    expect(excerpt('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(excerpt('   ')).toBeNull();
  });
});
