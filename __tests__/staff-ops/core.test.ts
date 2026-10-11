/**
 * Ekip operasyonları saf kuralları: İstanbul günü, vardiya penceresi (gece vardiyası dahil),
 * puantaj durum makinesi, görev geçişleri, izin doğrulaması, kontrol listesi zorunlu maddeleri.
 */
import {
  attendanceState,
  compareTasks,
  decideClock,
  decideManagerTaskTransition,
  decideStaffTaskTransition,
  istanbulYmd,
  lateMinutes,
  missingRequiredItems,
  parseChecklistItems,
  shiftWindow,
  validateLeaveRange,
  validateShiftTimes,
  weekStartYmd,
  coarseCoordinate,
  fieldReportStatusOf,
} from '@/lib/staff-ops/core';

const d = (iso: string) => new Date(iso);
const SHIFT = { date: d('2026-10-12T00:00:00.000Z'), startTime: '09:00', endTime: '17:00', clockInAt: null, clockOutAt: null };

describe('takvim', () => {
  it('İstanbul günü UTC değil: 22:30Z ertesi gündür', () => {
    expect(istanbulYmd(d('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
    expect(istanbulYmd(d('2026-10-11T20:59:00Z'))).toBe('2026-10-11');
  });
  it('hafta Pazartesi başlar', () => {
    expect(weekStartYmd('2026-10-11')).toBe('2026-10-05'); // Pazar
    expect(weekStartYmd('2026-10-12')).toBe('2026-10-12'); // Pazartesi
  });
});

describe('vardiya penceresi', () => {
  it('09:00 İstanbul = 06:00Z', () => {
    const w = shiftWindow(SHIFT)!;
    expect(w.start.toISOString()).toBe('2026-10-12T06:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(w.plannedMinutes).toBe(480);
  });
  it('gece vardiyası ertesi güne sarkar', () => {
    const w = shiftWindow({ ...SHIFT, startTime: '22:00', endTime: '02:00' })!;
    expect(w.overnight).toBe(true);
    expect(w.plannedMinutes).toBe(240);
    expect(w.end.toISOString()).toBe('2026-10-12T23:00:00.000Z');
  });
  it('plan doğrulaması', () => {
    expect(validateShiftTimes('09:00', '09:00')).toMatch(/aynı/);
    expect(validateShiftTimes('9:00', '17:00')).toMatch(/SS:DD/);
    expect(validateShiftTimes('06:00', '23:30')).toMatch(/16 saat/);
    expect(validateShiftTimes('22:00', '06:00')).toBeNull();
  });
});

describe('puantaj durum makinesi', () => {
  it('pencereden önce giriş reddedilir, 60 dk içinde kabul', () => {
    expect(decideClock(SHIFT, 'clock_in', d('2026-10-12T04:59:00Z'))).toEqual({ ok: false, code: 'TOO_EARLY' });
    expect(decideClock(SHIFT, 'clock_in', d('2026-10-12T05:00:00Z'))).toEqual({ ok: true });
  });
  it('vardiya bittikten sonra giriş yok; ikinci giriş yok', () => {
    expect(decideClock(SHIFT, 'clock_in', d('2026-10-12T14:01:00Z'))).toEqual({ ok: false, code: 'SHIFT_OVER' });
    expect(decideClock({ ...SHIFT, clockInAt: d('2026-10-12T06:00:00Z') }, 'clock_in', d('2026-10-12T07:00:00Z'))).toEqual({
      ok: false,
      code: 'ALREADY_CLOCKED_IN',
    });
  });
  it('girişsiz çıkış ve ikinci çıkış reddedilir', () => {
    expect(decideClock(SHIFT, 'clock_out', d('2026-10-12T10:00:00Z'))).toEqual({ ok: false, code: 'NOT_CLOCKED_IN' });
    const out = { ...SHIFT, clockInAt: d('2026-10-12T06:00:00Z'), clockOutAt: d('2026-10-12T14:00:00Z') };
    expect(decideClock(out, 'clock_out', d('2026-10-12T15:00:00Z'))).toEqual({ ok: false, code: 'ALREADY_CLOCKED_OUT' });
  });
  it('çıkış penceresi 12 saatle sınırlı (unutulan çıkış yöneticiye kalır)', () => {
    const inn = { ...SHIFT, clockInAt: d('2026-10-12T06:00:00Z') };
    expect(decideClock(inn, 'clock_out', d('2026-10-13T01:59:00Z'))).toEqual({ ok: true });
    expect(decideClock(inn, 'clock_out', d('2026-10-13T02:01:00Z'))).toEqual({ ok: false, code: 'CLOCK_OUT_WINDOW_PASSED' });
  });
  it('katılım durumu ve gecikme', () => {
    expect(attendanceState(SHIFT, d('2026-10-12T05:00:00Z'))).toBe('upcoming');
    expect(attendanceState(SHIFT, d('2026-10-12T06:03:00Z'))).toBe('scheduled');
    expect(attendanceState(SHIFT, d('2026-10-12T06:30:00Z'))).toBe('late');
    expect(attendanceState(SHIFT, d('2026-10-12T15:00:00Z'))).toBe('missed');
    const inn = { ...SHIFT, clockInAt: d('2026-10-12T06:12:00Z') };
    expect(attendanceState(inn, d('2026-10-12T07:00:00Z'))).toBe('working');
    expect(lateMinutes(inn)).toBe(12);
  });
});

describe('görevler', () => {
  it('açık görevler önce, tamamlananlar sonra (alfabetik değil)', () => {
    const rows = [
      { status: 'completed', dueAt: null },
      { status: 'pending', dueAt: '2026-10-20T00:00:00Z' },
      { status: 'in_progress', dueAt: null },
      { status: 'pending', dueAt: '2026-10-13T00:00:00Z' },
      { status: 'cancelled', dueAt: null },
    ];
    expect([...rows].sort(compareTasks).map((r) => `${r.status}:${r.dueAt ?? '-'}`)).toEqual([
      'in_progress:-',
      'pending:2026-10-13T00:00:00Z',
      'pending:2026-10-20T00:00:00Z',
      'completed:-',
      'cancelled:-',
    ]);
  });
  it('personel iptal edemez; geri alma 10 dk ile sınırlı', () => {
    const now = d('2026-10-12T10:00:00Z');
    expect(decideStaffTaskTransition({ status: 'pending', completedAt: null }, 'in_progress', now).ok).toBe(true);
    expect(decideStaffTaskTransition({ status: 'in_progress', completedAt: null }, 'in_progress', now).ok).toBe(false);
    expect(decideStaffTaskTransition({ status: 'cancelled', completedAt: null }, 'completed', now).ok).toBe(false);
    expect(decideStaffTaskTransition({ status: 'completed', completedAt: d('2026-10-12T09:55:00Z') }, 'reopen', now)).toMatchObject({
      ok: true,
      to: 'in_progress',
    });
    expect(decideStaffTaskTransition({ status: 'completed', completedAt: d('2026-10-12T09:40:00Z') }, 'reopen', now).ok).toBe(false);
  });
  it('yönetici: yalnız açık görev iptal, yalnız kapalı görev yeniden açılır', () => {
    expect(decideManagerTaskTransition({ status: 'pending' }, 'cancelled').ok).toBe(true);
    expect(decideManagerTaskTransition({ status: 'completed' }, 'cancelled').ok).toBe(false);
    expect(decideManagerTaskTransition({ status: 'cancelled' }, 'pending').ok).toBe(true);
    expect(decideManagerTaskTransition({ status: 'in_progress' }, 'pending').ok).toBe(false);
  });
});

describe('izin', () => {
  const today = '2026-10-12';
  it('geçmiş, ters aralık, 30 günü aşan talep reddedilir', () => {
    expect(validateLeaveRange('2026-10-11', '2026-10-12', today)).toMatch(/Geçmiş/);
    expect(validateLeaveRange('2026-10-14', '2026-10-13', today)).toMatch(/önce/);
    expect(validateLeaveRange('2026-10-13', '2026-11-20', today)).toMatch(/30 gün/);
    expect(validateLeaveRange('2026-10-12', '2026-10-12', today)).toBeNull();
    expect(validateLeaveRange('2026-02-30', '2026-03-01', today)).toMatch(/Geçerli/);
  });
});

describe('kontrol listesi ve saha', () => {
  it('bozuk maddeler atılır; zorunlu eksikler bulunur', () => {
    const defs = parseChecklistItems([{ id: 'a', label: 'Kasa sayıldı' }, { id: 'b', label: 'Işıklar', required: false }, { label: 'kimliksiz' }, 'x']);
    expect(defs).toEqual([
      { id: 'a', label: 'Kasa sayıldı', required: true },
      { id: 'b', label: 'Işıklar', required: false },
    ]);
    expect(missingRequiredItems(defs, [{ itemId: 'b', done: true }])).toEqual(['Kasa sayıldı']);
    expect(missingRequiredItems(defs, [{ itemId: 'a', done: true }])).toEqual([]);
  });
  it('konum ~100 m yuvarlanır; Incident durumu bildirim durumuna eşlenir', () => {
    expect(coarseCoordinate(41.015137)).toBe(41.015);
    expect(fieldReportStatusOf('open')).toBe('open');
    expect(fieldReportStatusOf('in_progress')).toBe('seen');
    expect(fieldReportStatusOf('resolved')).toBe('resolved');
  });
});
