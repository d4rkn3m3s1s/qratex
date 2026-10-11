/**
 * Ekip operasyonları — SAF iş kuralları (DB'siz, Jest ile test edilir).
 *
 * Kullananlar: /dealer/team (bayi ekip merkezi) ve /staff (personel "Bugün" ekranı).
 * Zaman: Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). `StaffShift.date` bir `@db.Date`
 * alanıdır; Prisma onu UTC gece yarısı `Date` olarak döndürür. Vardiyanın gerçek başlangıç/bitiş
 * anı = İstanbul takvim günü + "HH:mm" → UTC.
 */

export const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ───────────────────────────── Takvim ─────────────────────────────

/** Verilen anın İstanbul takvim günü, `YYYY-MM-DD`. (`toISOString().slice(0,10)` UTC'dir, kullanmayın.) */
export function istanbulYmd(at: Date): string {
  return new Date(at.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `@db.Date` alanıyla karşılaştırılabilir UTC gece yarısı. */
export function ymdToDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** `@db.Date` değeri → `YYYY-MM-DD`. */
export function dbDateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  return dbDateToYmd(new Date(ymdToDbDate(ymd).getTime() + days * DAY_MS));
}

/** Haftanın Pazartesi günü (İstanbul takvimi). */
export function weekStartYmd(ymd: string): string {
  const dow = ymdToDbDate(ymd).getUTCDay(); // 0 = Pazar
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysYmd(ymd, -back);
}

export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = ymdToDbDate(v);
  return !Number.isNaN(d.getTime()) && dbDateToYmd(d) === v;
}

/** İstanbul gününün başlangıcı (UTC anı). */
export function istanbulDayStartInstant(ymd: string): Date {
  return new Date(ymdToDbDate(ymd).getTime() - ISTANBUL_OFFSET_MS);
}

// ───────────────────────────── Saat ─────────────────────────────

export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function hhmmToMinutes(v: string): number | null {
  const m = HHMM_RE.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface ShiftWindow {
  start: Date;
  end: Date;
  /** Bitiş saati başlangıçtan küçük/eşit → ertesi güne sarkan (gece) vardiya. */
  overnight: boolean;
  plannedMinutes: number;
}

/** Vardiyanın planlanan başlangıç/bitiş anları (UTC). Geçersiz saatte null. */
export function shiftWindow(shift: { date: Date | string; startTime: string; endTime: string }): ShiftWindow | null {
  const s = hhmmToMinutes(shift.startTime);
  const e = hhmmToMinutes(shift.endTime);
  if (s == null || e == null) return null;
  const ymd = typeof shift.date === 'string' ? shift.date.slice(0, 10) : dbDateToYmd(shift.date);
  const dayStart = istanbulDayStartInstant(ymd).getTime();
  const overnight = e <= s;
  const start = new Date(dayStart + s * 60_000);
  const end = new Date(dayStart + (overnight ? e + 24 * 60 : e) * 60_000);
  return { start, end, overnight, plannedMinutes: Math.round((end.getTime() - start.getTime()) / 60_000) };
}

// ───────────────────────────── Puantaj durum makinesi ─────────────────────────────

/** Girişe izin verilen erken pencere (planlanan başlangıçtan önce). */
export const CLOCK_IN_EARLY_MIN = 60;
/** Planlanan bitişten sonra hâlâ giriş yapılabilen pay (çok geç gelen personel). */
export const CLOCK_IN_LATE_GRACE_MIN = 0;
/** Çıkış için planlanan bitişten sonra tanınan en uzun süre; aşılırsa yönetici düzeltir. */
export const CLOCK_OUT_MAX_AFTER_END_MIN = 12 * 60;
/** Bu kadar dakikadan geç giriş "geç kaldı" sayılır. */
export const LATE_THRESHOLD_MIN = 5;

export type ClockAction = 'clock_in' | 'clock_out';

export type ClockErrorCode =
  | 'INVALID_SHIFT_TIME'
  | 'ALREADY_CLOCKED_IN'
  | 'TOO_EARLY'
  | 'SHIFT_OVER'
  | 'NOT_CLOCKED_IN'
  | 'ALREADY_CLOCKED_OUT'
  | 'CLOCK_OUT_WINDOW_PASSED';

export const CLOCK_ERROR_MESSAGES: Readonly<Record<ClockErrorCode, string>> = {
  INVALID_SHIFT_TIME: 'Vardiya saatleri geçersiz. Yöneticinize bildirin.',
  ALREADY_CLOCKED_IN: 'Bu vardiyaya zaten giriş yaptınız.',
  TOO_EARLY: `Vardiyaya en erken başlangıçtan ${CLOCK_IN_EARLY_MIN} dakika önce giriş yapabilirsiniz.`,
  SHIFT_OVER: 'Bu vardiyanın süresi doldu. Yöneticiniz puantajı düzeltebilir.',
  NOT_CLOCKED_IN: 'Çıkış için önce vardiyaya giriş yapmalısınız.',
  ALREADY_CLOCKED_OUT: 'Bu vardiyadan zaten çıkış yaptınız.',
  CLOCK_OUT_WINDOW_PASSED: 'Çıkış süresi geçti. Yöneticiniz puantajı düzeltecek.',
};

export interface ClockableShift {
  date: Date | string;
  startTime: string;
  endTime: string;
  clockInAt: Date | null;
  clockOutAt: Date | null;
}

export type ClockDecision = { ok: true } | { ok: false; code: ClockErrorCode };

/** Sunucu otoriter puantaj geçişi. Sonuç `updateMany` koşuluyla da (yarış) korunur. */
export function decideClock(shift: ClockableShift, action: ClockAction, now: Date): ClockDecision {
  const w = shiftWindow(shift);
  if (!w) return { ok: false, code: 'INVALID_SHIFT_TIME' };
  const t = now.getTime();
  if (action === 'clock_in') {
    if (shift.clockInAt) return { ok: false, code: 'ALREADY_CLOCKED_IN' };
    if (t < w.start.getTime() - CLOCK_IN_EARLY_MIN * 60_000) return { ok: false, code: 'TOO_EARLY' };
    if (t > w.end.getTime() + CLOCK_IN_LATE_GRACE_MIN * 60_000) return { ok: false, code: 'SHIFT_OVER' };
    return { ok: true };
  }
  if (!shift.clockInAt) return { ok: false, code: 'NOT_CLOCKED_IN' };
  if (shift.clockOutAt) return { ok: false, code: 'ALREADY_CLOCKED_OUT' };
  if (t > w.end.getTime() + CLOCK_OUT_MAX_AFTER_END_MIN * 60_000) return { ok: false, code: 'CLOCK_OUT_WINDOW_PASSED' };
  return { ok: true };
}

export type AttendanceState = 'scheduled' | 'late' | 'working' | 'done' | 'missed' | 'upcoming';

/** Bayi panosu için vardiya katılım durumu. */
export function attendanceState(shift: ClockableShift, now: Date): AttendanceState {
  const w = shiftWindow(shift);
  if (shift.clockOutAt) return 'done';
  if (shift.clockInAt) return 'working';
  if (!w) return 'scheduled';
  const t = now.getTime();
  if (t < w.start.getTime()) return 'upcoming';
  if (t > w.end.getTime()) return 'missed';
  if (t > w.start.getTime() + LATE_THRESHOLD_MIN * 60_000) return 'late';
  return 'scheduled';
}

/** Girişin planlanan başlangıca göre gecikmesi (dk, erken girişte 0). */
export function lateMinutes(shift: ClockableShift): number | null {
  const w = shiftWindow(shift);
  if (!w || !shift.clockInAt) return null;
  return Math.max(0, Math.round((shift.clockInAt.getTime() - w.start.getTime()) / 60_000));
}

/** Çalışılan dakika (çıkış yoksa `now`'a kadar). */
export function workedMinutes(shift: Pick<ClockableShift, 'clockInAt' | 'clockOutAt'>, now: Date): number | null {
  if (!shift.clockInAt) return null;
  const end = shift.clockOutAt ?? now;
  return Math.max(0, Math.round((end.getTime() - shift.clockInAt.getTime()) / 60_000));
}

/** Vardiya planlama doğrulaması (bayi). Gece vardiyası için bitiş < başlangıç serbesttir; eşitlik değil. */
export function validateShiftTimes(startTime: string, endTime: string): string | null {
  const s = hhmmToMinutes(startTime);
  const e = hhmmToMinutes(endTime);
  if (s == null || e == null) return 'Saatler SS:DD biçiminde olmalı.';
  if (s === e) return 'Başlangıç ve bitiş saati aynı olamaz.';
  const len = e > s ? e - s : e + 24 * 60 - s;
  if (len > 16 * 60) return 'Bir vardiya en fazla 16 saat olabilir.';
  return null;
}

// ───────────────────────────── Görevler ─────────────────────────────

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress'];

const TASK_RANK: Record<string, number> = { in_progress: 0, pending: 1, completed: 2, cancelled: 3 };

/** Açık görevler önce (devam eden → bekleyen), sonra son tarihe göre (tarihsizler sonda). */
export function compareTasks(
  a: { status: string; dueAt: Date | string | null; createdAt?: Date | string },
  b: { status: string; dueAt: Date | string | null; createdAt?: Date | string }
): number {
  const r = (TASK_RANK[a.status] ?? 9) - (TASK_RANK[b.status] ?? 9);
  if (r !== 0) return r;
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bc - ac;
}

export function isTaskOverdue(task: { status: string; dueAt: Date | string | null }, now: Date): boolean {
  return (task.status === 'pending' || task.status === 'in_progress') && !!task.dueAt && new Date(task.dueAt).getTime() < now.getTime();
}

/** Personelin tamamlamayı geri alabileceği süre. */
export const TASK_UNDO_WINDOW_MS = 10 * 60_000;

export type StaffTaskTarget = 'in_progress' | 'completed' | 'reopen';

/**
 * Personel tarafı görev geçişleri (iptal YOK — iptal yönetici yetkisi):
 *  pending → in_progress · pending|in_progress → completed · completed → in_progress (yalnız 10 dk içinde, "geri al").
 */
export function decideStaffTaskTransition(
  task: { status: string; completedAt: Date | null },
  target: StaffTaskTarget,
  now: Date
): { ok: true; from: TaskStatus[]; to: TaskStatus } | { ok: false; message: string } {
  if (target === 'in_progress') {
    if (task.status !== 'pending') return { ok: false, message: 'Yalnız bekleyen bir görev başlatılabilir.' };
    return { ok: true, from: ['pending'], to: 'in_progress' };
  }
  if (target === 'completed') {
    if (task.status !== 'pending' && task.status !== 'in_progress') return { ok: false, message: 'Bu görev zaten kapatılmış.' };
    return { ok: true, from: ['pending', 'in_progress'], to: 'completed' };
  }
  if (task.status !== 'completed' || !task.completedAt) return { ok: false, message: 'Yalnız tamamlanan görev geri alınabilir.' };
  if (now.getTime() - task.completedAt.getTime() > TASK_UNDO_WINDOW_MS) {
    return { ok: false, message: 'Geri alma süresi (10 dk) doldu. Yöneticinizden görevi yeniden açmasını isteyin.' };
  }
  return { ok: true, from: ['completed'], to: 'in_progress' };
}

/** Bayi tarafı görev geçişleri: iptal (açık görev) ve yeniden açma (kapalı görev). */
export function decideManagerTaskTransition(
  task: { status: string },
  target: 'cancelled' | 'pending'
): { ok: true; from: TaskStatus[] } | { ok: false; message: string } {
  if (target === 'cancelled') {
    if (task.status !== 'pending' && task.status !== 'in_progress') return { ok: false, message: 'Yalnız açık görev iptal edilebilir.' };
    return { ok: true, from: ['pending', 'in_progress'] };
  }
  if (task.status !== 'completed' && task.status !== 'cancelled') return { ok: false, message: 'Görev zaten açık.' };
  return { ok: true, from: ['completed', 'cancelled'] };
}

// ───────────────────────────── İzin ─────────────────────────────

export const LEAVE_MAX_DAYS = 30;
export const LEAVE_MAX_AHEAD_DAYS = 365;

export function leaveDays(startYmd: string, endYmd: string): number {
  return Math.round((ymdToDbDate(endYmd).getTime() - ymdToDbDate(startYmd).getTime()) / DAY_MS) + 1;
}

/** Personelin yeni izin talebi doğrulaması (bugünden önce başlayamaz, en fazla 30 gün, en fazla 1 yıl ileri). */
export function validateLeaveRange(startYmd: string, endYmd: string, todayYmd: string): string | null {
  if (!isYmd(startYmd) || !isYmd(endYmd)) return 'Geçerli bir tarih seçin.';
  if (endYmd < startYmd) return 'Bitiş tarihi başlangıçtan önce olamaz.';
  if (startYmd < todayYmd) return 'Geçmiş tarihler için izin talep edilemez.';
  if (leaveDays(todayYmd, startYmd) - 1 > LEAVE_MAX_AHEAD_DAYS) return 'En fazla bir yıl sonrası için talep oluşturabilirsiniz.';
  if (leaveDays(startYmd, endYmd) > LEAVE_MAX_DAYS) return `Tek talepte en fazla ${LEAVE_MAX_DAYS} gün seçebilirsiniz.`;
  return null;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// ───────────────────────────── Kontrol listesi ─────────────────────────────

export interface ChecklistItemDef {
  id: string;
  label: string;
  required: boolean;
}

export const CHECKLIST_TYPES = ['open', 'close', 'custom'] as const;
export type ChecklistType = (typeof CHECKLIST_TYPES)[number];
export const CHECKLIST_MAX_ITEMS = 50;

/** `ChecklistTemplate.items` JSON'unu güvenle okur (bozuk satırları atar). */
export function parseChecklistItems(raw: unknown): ChecklistItemDef[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItemDef[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.slice(0, 64) : null;
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 200) : '';
    if (!id || !label) continue;
    out.push({ id, label, required: o.required !== false });
  }
  return out.slice(0, CHECKLIST_MAX_ITEMS);
}

/** Zorunlu maddelerin hepsi işaretli mi? Eksik zorunlu maddelerin etiketlerini döndürür. */
export function missingRequiredItems(defs: ChecklistItemDef[], done: ReadonlyArray<{ itemId: string; done: boolean }>): string[] {
  const doneSet = new Set(done.filter((d) => d.done).map((d) => d.itemId));
  return defs.filter((d) => d.required && !doneSet.has(d.id)).map((d) => d.label);
}

// ───────────────────────────── Saha bildirimi ─────────────────────────────

export const FIELD_REPORT_CATEGORIES = ['busy', 'stock', 'equipment', 'hygiene', 'customer', 'other'] as const;
export type FieldReportCategory = (typeof FIELD_REPORT_CATEGORIES)[number];

export const FIELD_REPORT_CATEGORY_TR: Readonly<Record<FieldReportCategory, string>> = {
  busy: 'Yoğunluk',
  stock: 'Stok bitti',
  equipment: 'Arıza',
  hygiene: 'Hijyen',
  customer: 'Müşteri şikâyeti',
  other: 'Diğer',
};

/** Saha bildirimleri `Incident` olarak yazılır; bu işaretle ayırt edilir. */
export const FIELD_REPORT_SOURCE = 'staff_field_report';

export type FieldReportStatus = 'open' | 'seen' | 'resolved';

/** Incident.status → personelin göreceği bildirim durumu. */
export function fieldReportStatusOf(incidentStatus: string): FieldReportStatus {
  if (incidentStatus === 'resolved') return 'resolved';
  if (incidentStatus === 'open') return 'open';
  return 'seen';
}

export function fieldReportSeverity(category: FieldReportCategory, urgent: boolean): 'low' | 'medium' | 'high' {
  if (urgent) return 'high';
  return category === 'equipment' || category === 'hygiene' || category === 'customer' ? 'medium' : 'low';
}

/** Konum ~100 m hassasiyete yuvarlanır (veri minimizasyonu, KVKK). */
export function coarseCoordinate(v: number): number {
  return Math.round(v * 1000) / 1000;
}
