/**
 * Turnuva çekirdeği: ISO hafta penceresi/anahtarı ve ödül tablosu. Haftalık turnuvanın
 * "dönem" tanımı buna dayanır — yanlış hafta sınırı, ödülü yanlış haftanın skorundan
 * verir veya claim'i çift açar. ISO 8601 hafta hesabı (Pzt başlangıç, Perşembe-yıl kuralı)
 * özellikle yıl dönümlerinde kritik.
 */
import {
  isoWeekStart,
  isoWeekEnd,
  isoWeekKey,
  previousIsoWeekKey,
  msUntilWeekEnd,
  prizeForRank,
  TOURNAMENT_PRIZES,
} from '@/lib/tournament-core';

describe('isoWeekStart — Pazartesi 00:00 UTC', () => {
  it('hafta içi bir gün → o haftanın Pazartesi\'si', () => {
    // 2026-08-05 Çarşamba → hafta başı 2026-08-03 Pazartesi
    const wed = new Date('2026-08-05T14:30:00.000Z');
    expect(isoWeekStart(wed).toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('Pazar → GEÇEN Pazartesi (Pazar haftanın son günü)', () => {
    // 2026-08-09 Pazar → hafta başı 2026-08-03 Pazartesi
    const sun = new Date('2026-08-09T23:59:59.000Z');
    expect(isoWeekStart(sun).toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('Pazartesi 00:00 → kendisi', () => {
    const mon = new Date('2026-08-03T00:00:00.000Z');
    expect(isoWeekStart(mon).toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });
});

describe('isoWeekEnd — bir sonraki Pazartesi', () => {
  it('hafta sonu = başlangıç + 7 gün', () => {
    const wed = new Date('2026-08-05T14:30:00.000Z');
    expect(isoWeekEnd(wed).toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('isoWeekKey — YYYY-Www', () => {
  it('aynı hafta içindeki farklı günler AYNI anahtar', () => {
    const mon = new Date('2026-08-03T00:00:00.000Z');
    const sun = new Date('2026-08-09T23:00:00.000Z');
    expect(isoWeekKey(mon)).toBe(isoWeekKey(sun));
  });

  it('ardışık haftalar FARKLI anahtar', () => {
    const w1 = new Date('2026-08-05T12:00:00.000Z');
    const w2 = new Date('2026-08-12T12:00:00.000Z');
    expect(isoWeekKey(w1)).not.toBe(isoWeekKey(w2));
  });

  it('bilinen ISO hafta: 2026-01-04 (Pazar) → 2026-W01', () => {
    // 2026-01-04 Pazar, ISO haftası W01 (Perşembe 2026-01-01 o yıla düşer)
    expect(isoWeekKey(new Date('2026-01-04T12:00:00.000Z'))).toBe('2026-W01');
  });

  it('yıl başı sınırı: 2026-01-01 (Perşembe) → 2026-W01', () => {
    expect(isoWeekKey(new Date('2026-01-01T12:00:00.000Z'))).toBe('2026-W01');
  });

  it('anahtar formatı YYYY-Www (sıfır dolgulu)', () => {
    expect(isoWeekKey(new Date('2026-03-02T12:00:00.000Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('previousIsoWeekKey', () => {
  it('bir önceki haftanın anahtarını verir', () => {
    const now = new Date('2026-08-05T12:00:00.000Z'); // W32 civarı
    const prev = previousIsoWeekKey(now);
    expect(prev).not.toBe(isoWeekKey(now));
    // Önceki hafta anahtarı, 7 gün öncesinin anahtarıyla aynı olmalı
    expect(prev).toBe(isoWeekKey(new Date('2026-07-29T12:00:00.000Z')));
  });
});

describe('msUntilWeekEnd', () => {
  it('hafta ortasında pozitif ve <= 7 gün', () => {
    const wed = new Date('2026-08-05T14:30:00.000Z');
    const ms = msUntilWeekEnd(wed);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('haftanın son anına çok yakın küçük bir kalan verir', () => {
    // 2026-08-09T23:59:59.999Z hâlâ 08-03..08-10 haftası; bitişe ~1ms kalır.
    const almostEnd = new Date('2026-08-09T23:59:59.999Z');
    const ms = msUntilWeekEnd(almostEnd);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(1000);
  });
});

describe('prizeForRank / TOURNAMENT_PRIZES', () => {
  it('ilk 3 ödül alır, sonrası 0', () => {
    expect(prizeForRank(1)).toBe(TOURNAMENT_PRIZES[1]);
    expect(prizeForRank(2)).toBe(TOURNAMENT_PRIZES[2]);
    expect(prizeForRank(3)).toBe(TOURNAMENT_PRIZES[3]);
    expect(prizeForRank(4)).toBe(0);
    expect(prizeForRank(0)).toBe(0);
  });

  it('ödüller azalan sırada (1 > 2 > 3)', () => {
    expect(TOURNAMENT_PRIZES[1]).toBeGreaterThan(TOURNAMENT_PRIZES[2]);
    expect(TOURNAMENT_PRIZES[2]).toBeGreaterThan(TOURNAMENT_PRIZES[3]);
  });
});
