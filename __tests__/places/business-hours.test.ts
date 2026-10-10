/**
 * Keşfet — açık/kapalı (denetim customer_nearby #33 SAHTE, Bulgu 4): bayinin kendi saatleri +
 * tatil modu, İstanbul duvar saatiyle; bilinmeyen saatte "Açık" UYDURULMAZ.
 */
import { computeOpenState, formatMinutes, openStateFor, parseBusinessHours } from '@/lib/places/business-hours';

// 2026-10-08 Perşembe. İstanbul = UTC+3.
const ist = (day: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 9, day, hh - 3, mm));

describe('parseBusinessHours', () => {
  it('bayi ayarlarındaki serbest metin örneğini okur (gün aralığı + ayrı gün)', () => {
    const s = parseBusinessHours('Pzt-Cum 09:00-18:00, Cmt 10:00-14:00');
    expect(s).not.toBeNull();
    for (const d of [1, 2, 3, 4, 5]) expect(s![d]).toEqual([{ open: 540, close: 1080 }]);
    expect(s![6]).toEqual([{ open: 600, close: 840 }]);
    expect(s![0]).toEqual([]);
  });

  it('gün belirtilmeyen saat her güne uygulanır; "her gün" ve nokta ayırıcı', () => {
    expect(parseBusinessHours('08:00 - 23:30')![3]).toEqual([{ open: 480, close: 1410 }]);
    expect(parseBusinessHours('Her gün 8.30-22')![0]).toEqual([{ open: 510, close: 1320 }]);
  });

  it('hafta içi / hafta sonu kapalı', () => {
    const s = parseBusinessHours('Hafta içi 9-18; Hafta sonu kapalı')!;
    expect(s[2]).toEqual([{ open: 540, close: 1080 }]);
    expect(s[6]).toEqual([]);
    expect(s[0]).toEqual([]);
  });

  it('aynı güne iki aralık ve gece taşan aralık', () => {
    const s = parseBusinessHours('Pzt 09:00-12:00 13:00-18:00')!;
    expect(s[1]).toEqual([
      { open: 540, close: 720 },
      { open: 780, close: 1080 },
    ]);
    expect(s[2]).toEqual([]);
    const night = parseBusinessHours('Cuma-Cumartesi 18:00-02:00')!;
    expect(night[5]).toEqual([{ open: 1080, close: 120 }]);
    expect(night[6]).toEqual([{ open: 1080, close: 120 }]);
  });

  it('İngilizce, 7/24 ve şema yorumundaki JSON biçimi', () => {
    expect(parseBusinessHours('Mon-Fri 10:00-20:00')![5]).toEqual([{ open: 600, close: 1200 }]);
    expect(parseBusinessHours('7/24')![4]).toEqual([{ open: 0, close: 1440 }]);
    const j = parseBusinessHours('{"mon":{"open":"09:00","close":"18:00"},"sun":null}')!;
    expect(j[1]).toEqual([{ open: 540, close: 1080 }]);
    expect(j[0]).toEqual([]);
  });

  it('saat içermeyen metin bilinmiyor (null) — uydurma yok', () => {
    expect(parseBusinessHours('Kafemiz her zaman sıcak')).toBeNull();
    expect(parseBusinessHours('')).toBeNull();
    expect(parseBusinessHours(null)).toBeNull();
  });
});

describe('computeOpenState (Europe/Istanbul)', () => {
  const weekday = parseBusinessHours('Pzt-Cum 09:00-18:00, Cmt 10:00-14:00');

  it('mesai içinde açık + kapanış saati; son saatte "yakında kapanıyor"', () => {
    expect(computeOpenState(weekday, false, ist(8, 12, 30))).toEqual({ status: 'open', closesAt: '18:00', closingSoon: false, nextOpen: null });
    expect(computeOpenState(weekday, false, ist(8, 17, 30))?.closingSoon).toBe(true);
  });

  it('sunucu UTC iken TR saati esas: 09:30 TR (06:30Z) açık — eski hesap 3 saat kayıktı', () => {
    expect(computeOpenState(weekday, false, ist(8, 9, 30))?.status).toBe('open');
    expect(computeOpenState(weekday, false, ist(8, 8, 30))?.status).toBe('closed');
  });

  it('kapalıyken bir sonraki açılışı verir (bugün / yarın / ileri gün)', () => {
    expect(computeOpenState(weekday, false, ist(8, 7, 0))?.nextOpen).toEqual({ inDays: 0, weekday: 4, time: '09:00' });
    expect(computeOpenState(weekday, false, ist(8, 19, 0))?.nextOpen).toEqual({ inDays: 1, weekday: 5, time: '09:00' });
    expect(computeOpenState(weekday, false, ist(10, 15, 0))?.nextOpen).toEqual({ inDays: 2, weekday: 1, time: '09:00' });
  });

  it('gece taşması: Cumartesi 00:30 Cuma gecesinin aralığında açıktır', () => {
    const night = parseBusinessHours('Cuma 18:00-02:00');
    expect(computeOpenState(night, false, ist(10, 0, 30))).toEqual({ status: 'open', closesAt: '02:00', closingSoon: false, nextOpen: null });
    expect(computeOpenState(night, false, ist(10, 1, 30))?.closingSoon).toBe(true);
    expect(computeOpenState(night, false, ist(10, 3, 0))?.status).toBe('closed');
  });

  it('tatil modu her şeyin önünde; program yoksa null', () => {
    expect(computeOpenState(weekday, true, ist(8, 12, 0))?.status).toBe('holiday');
    expect(computeOpenState(null, false, ist(8, 12, 0))).toBeNull();
    expect(openStateFor('saat yok', false, ist(8, 12, 0))).toBeNull();
    expect(openStateFor(null, true, ist(8, 12, 0))?.status).toBe('holiday');
  });

  it('24 saat açık kapanış saati vermez', () => {
    expect(computeOpenState(parseBusinessHours('7/24'), false, ist(8, 3, 0))).toEqual({ status: 'open', closesAt: null, closingSoon: false, nextOpen: null });
    expect(formatMinutes(1440)).toBe('00:00');
  });
});
