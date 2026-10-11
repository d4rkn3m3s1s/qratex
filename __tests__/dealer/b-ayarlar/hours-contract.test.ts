/**
 * Ayarlar › İşletme: çalışma saati düzenleyici modeli ↔ kayıt metni, iş kuralları ve sekme
 * takma adları. Yazılan JSON, müşteri tarafının okuyucusu (`lib/places/business-hours`) ile
 * birebir aynı programı üretmeli (Keşfet'teki "Açık / Kapalı" bayinin girdiğiyle aynı).
 */
import { computeOpenState, parseBusinessHours } from '@/lib/places/business-hours';
import { emptyWeek, hoursFromStored, validateWeek, weekToStored } from '@/lib/dealer-settings/hours';
import { businessPatchSchema, resolveDealerSettingsTab, type WeeklyHours } from '@/lib/dealer-settings/contract';

function week(over: Partial<Record<number, WeeklyHours[number]>> = {}): WeeklyHours {
  return emptyWeek().map((d, i) => over[i] ?? d);
}

describe('çalışma saatleri modeli', () => {
  it('hiç açık gün yoksa kayıt null (saat bilinmiyor; rozet uydurulmaz)', () => {
    expect(weekToStored(emptyWeek())).toBeNull();
  });

  it('yazılan JSON müşteri okuyucusunda aynı programa çözülür (Pzt=1 … Paz=0)', () => {
    const w = week({ 0: { open: true, ranges: [{ open: '09:00', close: '18:00' }] }, 6: { open: true, ranges: [{ open: '10:00', close: '14:00' }] } });
    const stored = weekToStored(w)!;
    const schedule = parseBusinessHours(stored)!;
    expect(schedule[1]).toEqual([{ open: 540, close: 1080 }]);
    expect(schedule[0]).toEqual([{ open: 600, close: 840 }]);
    expect(schedule[2]).toEqual([]);
    // İstanbul pazartesi 12:00 → açık, 18:00'de kapanır.
    const monNoon = new Date('2026-10-12T09:00:00Z');
    expect(computeOpenState(schedule, false, monNoon)).toMatchObject({ status: 'open', closesAt: '18:00' });
  });

  it('kayıt → düzenleyici → kayıt gidiş-dönüşü kayıpsız (gece taşan ve 24 saat dahil)', () => {
    const w = week({
      4: { open: true, ranges: [{ open: '18:00', close: '02:00' }] },
      5: { open: true, ranges: [{ open: '00:00', close: '24:00' }] },
    });
    const back = hoursFromStored(weekToStored(w));
    expect(back.legacy).toBeNull();
    expect(back.hours[4]).toEqual({ open: true, ranges: [{ open: '18:00', close: '02:00' }] });
    expect(back.hours[5]).toEqual({ open: true, ranges: [{ open: '00:00', close: '24:00' }] });
  });

  it('eski serbest metin çözülüp düzenleyiciye yüklenir ve "eski" olarak işaretlenir', () => {
    const r = hoursFromStored('Pzt-Cum 09:00-18:00, Cmt 10:00-14:00');
    expect(r.legacy).toEqual({ raw: 'Pzt-Cum 09:00-18:00, Cmt 10:00-14:00', parsed: true });
    expect(r.hours[0].ranges).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(r.hours[5].ranges).toEqual([{ open: '10:00', close: '14:00' }]);
    expect(r.hours[6].open).toBe(false);
  });

  it('çözülemeyen metin düzenleyiciyi boş bırakır, ham metni gösterir', () => {
    const r = hoursFromStored('genelde akşamları');
    expect(r.legacy).toEqual({ raw: 'genelde akşamları', parsed: false });
    expect(r.hours.every((d) => !d.open)).toBe(true);
  });
});

describe('çalışma saati kuralları', () => {
  it('açık gün aralıksız olamaz; açılış = kapanış reddedilir', () => {
    const issues = validateWeek(week({ 0: { open: true, ranges: [] }, 1: { open: true, ranges: [{ open: '10:00', close: '10:00' }] } }));
    expect(issues.map((i) => i.day)).toEqual([0, 1]);
  });

  it('çakışan aralık ve son olmayan gece aralığı reddedilir', () => {
    const issues = validateWeek(
      week({
        0: { open: true, ranges: [{ open: '09:00', close: '14:00' }, { open: '13:00', close: '18:00' }] },
        1: { open: true, ranges: [{ open: '20:00', close: '02:00' }, { open: '10:00', close: '12:00' }] },
      })
    );
    expect(issues.some((i) => i.day === 0)).toBe(true);
    expect(issues.some((i) => i.day === 1 && /son aralığı/.test(i.message))).toBe(true);
  });

  it('öğle arası ve gece taşan son aralık geçerli', () => {
    const issues = validateWeek(
      week({ 0: { open: true, ranges: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '18:00' }, { open: '20:00', close: '01:00' }] } })
    );
    expect(issues).toEqual([]);
  });
});

describe('sözleşme', () => {
  it('sekme takma adları (onboarding "profil", eski billing/ai-settings) kanonik sekmeye çözülür', () => {
    expect(resolveDealerSettingsTab('profil')).toBe('business');
    expect(resolveDealerSettingsTab('location')).toBe('business');
    expect(resolveDealerSettingsTab('abonelik')).toBe('billing');
    expect(resolveDealerSettingsTab('AI')).toBe('ai');
    expect(resolveDealerSettingsTab('appearance')).toBe('account');
    expect(resolveDealerSettingsTab('yok')).toBeNull();
  });

  it('PATCH gövdesi baseVersion olmadan reddedilir; konum yarım gönderilemez', () => {
    expect(businessPatchSchema.safeParse({ businessName: 'Kafe' }).success).toBe(false);
    expect(businessPatchSchema.safeParse({ baseVersion: 'v1', latitude: 41 }).success).toBe(false);
    expect(businessPatchSchema.safeParse({ baseVersion: 'v1', latitude: 41, longitude: 29 }).success).toBe(true);
    expect(businessPatchSchema.safeParse({ baseVersion: 'v1', latitude: null, longitude: null }).success).toBe(true);
    expect(businessPatchSchema.safeParse({ baseVersion: 'v1', businessName: 'x' }).success).toBe(false);
    expect(businessPatchSchema.safeParse({ baseVersion: 'v1', bilinmeyen: 1 }).success).toBe(false);
  });
});
