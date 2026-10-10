/**
 * P0-39 (müşteri · kampanyalar): "kampanya listesi her zaman boş".
 *
 * Eski sayfa `data.happyHours` okuyordu; müşteri yanıtı `{ activeNow, upcoming, ... }` döndürür
 * → liste canlıda hep boştu. Bu test, GERÇEK uç yanıt şekliyle (app/api/happy-hour GET müşteri
 * dalı) adaptörün listeyi doldurduğunu ve canlılık/pencerelerin puanlamayla
 * (lib/happy-hour-live#isHappyHourLive, İstanbul duvar saati) birebir aynı hesaplandığını doğrular.
 */
import {
  currentOrNextWindow,
  formatDayLabel,
  formatDuration,
  formatMultiplier,
  formatRecurrence,
  formatWindowRange,
  parseHappyHourFeed,
  parseHappyHourFeedWithZone,
  parseOffer,
  scheduleOffers,
  type HappyHourOffer,
} from '@/lib/places/happy-hour-schedule';
import { isHappyHourLive } from '@/lib/happy-hour-live';

// 2026-10-08 Perşembe, 09:30 UTC = 12:30 İstanbul.
const NOW = new Date(Date.UTC(2026, 9, 8, 9, 30));
const IST = 'Europe/Istanbul';

const lunch = {
  id: 'hh-lunch',
  dealerId: 'd1',
  name: 'Öğle Bonusu',
  description: 'Öğle saatlerinde 2x',
  multiplier: 2,
  startTime: '12:00',
  endTime: '14:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  isActive: true,
  validFrom: null,
  validUntil: null,
  dealer: { id: 'd1', businessName: 'Kahve Evi', image: null },
};

const evening = { ...lunch, id: 'hh-evening', name: 'Akşam', multiplier: 1.5, startTime: '16:00', endTime: '18:00' };

const weekendGlobal = {
  ...lunch,
  id: 'hh-weekend',
  dealerId: null,
  dealer: null,
  name: 'Hafta Sonu Çılgınlığı',
  startTime: '10:00',
  endTime: '22:00',
  daysOfWeek: [0, 6],
};

function live(o: HappyHourOffer, at: Date) {
  return isHappyHourLive(
    { startTime: o.startTime, endTime: o.endTime, daysOfWeek: o.days, isActive: o.isActive, validFrom: o.validFrom, validUntil: o.validUntil },
    at
  );
}

describe('parseHappyHourFeed — yanıt sözleşmesi', () => {
  it('gerçek müşteri yanıtını (activeNow/upcoming) okur — eski sayfa burada hep boş liste görüyordu', () => {
    const body = {
      success: true,
      activeNow: [lunch],
      upcoming: [lunch, evening], // aynı kayıt iki listede gelse de tekilleşir
      bestMultiplier: 2,
      currentTime: '12:30',
      currentDay: 4,
      timeZone: IST,
    };
    expect((body as Record<string, unknown>).happyHours).toBeUndefined();
    const { offers, timeZone } = parseHappyHourFeedWithZone(body);
    expect(offers.map((o) => o.id).sort()).toEqual(['hh-evening', 'hh-lunch']);
    expect(timeZone).toBe(IST);
  });

  it('zarf v2 (`data` içinde) ve liste biçimlerini de okur', () => {
    expect(parseHappyHourFeed({ ok: true, success: true, data: { activeNow: [lunch], upcoming: [] } })).toHaveLength(1);
    expect(parseHappyHourFeed({ success: true, happyHours: [lunch, evening] })).toHaveLength(2);
    expect(parseHappyHourFeed({ success: true, data: [lunch] })).toHaveLength(1);
    expect(parseHappyHourFeed([evening])).toHaveLength(1);
  });

  it('bilinmeyen/geçersiz saat dilimi varsayılana düşer', () => {
    expect(parseHappyHourFeedWithZone({ activeNow: [], timeZone: 'Mars/Olympus' }).timeZone).toBe(IST);
    expect(parseHappyHourFeedWithZone({ activeNow: [] }).timeZone).toBe(IST);
  });

  it('bozuk/eksik yanıtta çökmez', () => {
    expect(parseHappyHourFeed(null)).toEqual([]);
    expect(parseHappyHourFeed({ success: false, error: 'x' })).toEqual([]);
    expect(parseHappyHourFeed({ activeNow: 'x' })).toEqual([]);
  });

  it('bozuk kayıtları atlar; aşırı çarpan puana uygulandığı gibi kırpılır', () => {
    expect(parseOffer({ ...lunch, startTime: '9:00' })).toBeNull();
    expect(parseOffer({ ...lunch, endTime: '25:00' })).toBeNull();
    expect(parseOffer({ ...lunch, multiplier: 'abc' })).toBeNull();
    expect(parseOffer({ ...lunch, multiplier: 1 })).toBeNull();
    expect(parseOffer({ ...lunch, multiplier: -3 })).toBeNull();
    expect(parseOffer({ ...lunch, startTime: '10:00', endTime: '10:00' })).toBeNull();
    expect(parseOffer({ ...lunch, multiplier: 1_000_000 })?.multiplier).toBe(3);
    expect(parseOffer({ ...lunch, multiplier: 50, effectiveMultiplier: 3 })?.multiplier).toBe(3);
    // daysOfWeek Json olduğu için dizi olmayabilir (eski sayfada `.map` çökmesi).
    expect(parseOffer({ ...lunch, daysOfWeek: { a: 1 } })?.days).toEqual([]);
    expect(parseOffer({ ...lunch, daysOfWeek: [6, 0, 0, 9, '2'] })?.days).toEqual([0, 2, 6]);
    expect(parseHappyHourFeed({ activeNow: [{ ...lunch, isActive: false }] })).toEqual([]);
  });

  it('global kampanyayı işaretler', () => {
    expect(parseOffer(weekendGlobal)?.scope).toBe('global');
    expect(parseOffer(lunch)?.scope).toBe('dealer');
  });
});

describe('scheduleOffers — puanlamayla aynı canlılık', () => {
  const offers = parseHappyHourFeed({ activeNow: [lunch], upcoming: [evening, weekendGlobal] });

  it('canlı → bugün → sonraki sıralaması ve isHappyHourLive ile aynı canlılık', () => {
    const s = scheduleOffers(offers, NOW, IST);
    expect(s.map((o) => [o.id, o.status])).toEqual([
      ['hh-lunch', 'live'],
      ['hh-evening', 'today'],
      ['hh-weekend', 'upcoming'],
    ]);
    for (const o of s) expect(o.status === 'live').toBe(live(o, NOW));
  });

  it('gösterilen saat aralığı ve kalan süre doğru', () => {
    const [first] = scheduleOffers(offers, NOW, IST);
    expect(formatWindowRange(first.window!, 'tr', IST)).toBe('12:00 – 14:00');
    // Farklı saat diliminde (ör. UTC) kullanıcı mutlak anı kendi saatinde görür.
    expect(formatWindowRange(first.window!, 'tr', 'UTC')).toBe('09:00 – 11:00');
    expect(formatDuration(first.window!.end.getTime() - NOW.getTime(), 'tr')).toBe('1 sa 31 dk');
  });

  it('bitiş dakikası dahil (isHappyHourLive `<= end`)', () => {
    const at = new Date(Date.UTC(2026, 9, 8, 11, 0, 30)); // 14:00:30 İst.
    expect(scheduleOffers(offers, at, IST)[0].status).toBe('live');
    const after = new Date(Date.UTC(2026, 9, 8, 11, 1)); // 14:01 İst.
    expect(scheduleOffers(offers, after, IST).find((o) => o.id === 'hh-lunch')?.status).not.toBe('live');
  });

  it('gece taşan pencere: gece yarısı sonrası önceki günün seçimine bağlı', () => {
    const late = parseOffer({ ...lunch, id: 'late', startTime: '22:00', endTime: '02:00', daysOfWeek: [4] })!;
    const thu23 = new Date(Date.UTC(2026, 9, 8, 20, 0)); // Perşembe 23:00 İst.
    const fri01 = new Date(Date.UTC(2026, 9, 8, 22, 0)); // Cuma 01:00 İst.
    const fri03 = new Date(Date.UTC(2026, 9, 9, 0, 0)); // Cuma 03:00 İst.
    for (const at of [thu23, fri01, fri03]) {
      const s = scheduleOffers([late], at, IST)[0];
      expect(s?.status === 'live').toBe(live(late, at));
    }
    expect(scheduleOffers([late], fri01, IST)[0].status).toBe('live');
    const w = scheduleOffers([late], thu23, IST)[0].window!;
    expect(formatWindowRange(w, 'tr', IST)).toBe('22:00 – 02:00');
  });

  it('pencere hesabı her an isHappyHourLive ile birebir aynı (1 hafta, 7 dk adım)', () => {
    const cases = [
      parseOffer({ ...lunch, id: 'a' })!,
      parseOffer({ ...lunch, id: 'b', startTime: '23:30', endTime: '00:30', daysOfWeek: [0, 3] })!,
      parseOffer({ ...lunch, id: 'c', startTime: '00:00', endTime: '23:59', daysOfWeek: [5, 6] })!,
      parseOffer({ ...lunch, id: 'd', startTime: '18:00', endTime: '06:00', daysOfWeek: [] })!,
    ];
    const start = Date.UTC(2026, 9, 5);
    for (let t = start; t < start + 7 * 24 * 60 * 60_000; t += 7 * 60_000) {
      const at = new Date(t);
      for (const o of cases) {
        const w = currentOrNextWindow(o, at);
        const inWindow = !!w && w.start.getTime() <= t && t < w.end.getTime();
        expect([o.id, at.toISOString(), inWindow]).toEqual([o.id, at.toISOString(), live(o, at)]);
      }
    }
  });

  it('geçerlilik bitmişse listeden düşer; başlamamışsa başlangıçtan sonraki pencereyi gösterir', () => {
    const expired = parseOffer({ ...lunch, id: 'exp', validUntil: '2026-10-01T00:00:00Z' })!;
    expect(scheduleOffers([expired], NOW, IST)).toEqual([]);
    const future = parseOffer({ ...lunch, id: 'fut', validFrom: '2026-10-12T00:00:00Z' })!;
    const w = currentOrNextWindow(future, NOW)!;
    expect(w.start.toISOString()).toBe('2026-10-12T09:00:00.000Z'); // Pazartesi 12:00 İst.
  });

  it('boş gün dizisi puanlamadaki gibi her gün sayılır', () => {
    const everyday = parseOffer({ ...lunch, id: 'e', daysOfWeek: [] })!;
    expect(scheduleOffers([everyday], NOW, IST)[0].status).toBe('live');
    expect(formatRecurrence(everyday, 'tr', IST)).toBe('Her gün');
  });
});

describe('biçimlendirme', () => {
  it('gün etiketleri ve tekrar günleri kullanıcının saat diliminde', () => {
    const tomorrow = new Date(Date.UTC(2026, 9, 9, 9, 0));
    expect(formatDayLabel(NOW, NOW, 'tr', IST)).toBe('Bugün');
    expect(formatDayLabel(tomorrow, NOW, 'tr', IST)).toBe('Yarın');
    expect(formatDayLabel(tomorrow, NOW, 'en', IST)).toBe('Tomorrow');
    expect(formatRecurrence(parseOffer(weekendGlobal)!, 'tr', IST)).toBe('Cmt, Paz');
    // Pazartesi 01:30 İst. başlangıç, UTC'deki kullanıcı için Pazar 22:30'dur.
    const earlyMon = parseOffer({ ...lunch, id: 'm', startTime: '01:30', endTime: '03:00', daysOfWeek: [1] })!;
    expect(formatRecurrence(earlyMon, 'tr', IST)).toBe('Pzt');
    expect(formatRecurrence(earlyMon, 'tr', 'UTC')).toBe('Paz');
  });

  it('çarpan biçimi', () => {
    expect(formatMultiplier(2, 'tr')).toBe('2x');
    expect(formatMultiplier(1.5, 'tr')).toBe('1,5x');
    expect(formatMultiplier(1.5, 'en')).toBe('1.5x');
  });

  it('süre biçimi', () => {
    expect(formatDuration(30_000, 'tr')).toBe('1 dk');
    expect(formatDuration(65 * 60_000, 'tr')).toBe('1 sa 5 dk');
    expect(formatDuration(2 * 24 * 60 * 60_000, 'en')).toBe('2 d');
  });
});
