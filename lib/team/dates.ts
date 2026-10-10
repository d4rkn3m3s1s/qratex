/**
 * Ekip modülü tarih semantiği — TEK kaynak (sunucu + istemci, saf).
 *
 * Kural (denetim Y5 / admin_ekip Bulgu 9): bitiş tarihi bir GÜNDÜR. Kullanıcı "10 Eki" seçtiğinde
 * görev 10 Ekim Europe/Istanbul günü bitene kadar (23:59:59.999) gecikmiş sayılmaz. Sunucu
 * `YYYY-MM-DD` alır ve `endOfIstanbulDay` ile saklar.
 *
 * Eski kayıtlar `new Date('YYYY-MM-DD')` ile UTC gece yarısı (TR 03:00) olarak yazılmıştı.
 * Göç yerine `effectiveDue` bu kayıtları okurken gün sonuna taşır: saat bileşeni tam
 * 00:00:00.000Z olan bitiş, o UTC takvim gününün İstanbul gün sonu kabul edilir.
 */

export const TEAM_TZ = 'Europe/Istanbul';
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEAM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` geçerli bir takvim günü mü? */
export function isTeamDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Bir anın İstanbul takvim günü (`YYYY-MM-DD`). */
export function istanbulDayOf(at: Date | string | number = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const parts = dayFormatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** İstanbul'un verilen andaki UTC farkı (dakika). Türkiye 2016'dan beri sabit +03:00. */
export function istanbulOffsetMinutes(at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TZ, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (!m) return 180;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return 180;
  }
}

/** `YYYY-MM-DD` İstanbul gününün son anı (23:59:59.999). Geçersiz gün → null. */
export function endOfIstanbulDay(day: string): Date | null {
  if (!isTeamDay(day)) return null;
  const m = DAY_RE.exec(day)!;
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const probe = new Date(utcMidnight + 12 * 3_600_000);
  const offsetMs = istanbulOffsetMinutes(probe) * 60_000;
  // Yerel 24:00 eksi 1 ms → UTC'ye çevir.
  return new Date(utcMidnight + 86_400_000 - 1 - offsetMs);
}

/** Eski "UTC gece yarısı" kaydı mı (gün-yalnız seçimden gelen)? */
export function isLegacyMidnightDue(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/** Saklanan bitişin etkin anı (eski UTC gece yarısı kayıtları gün sonuna taşınır). */
export function effectiveDue(dueAt: Date | string | null | undefined): Date | null {
  if (!dueAt) return null;
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  if (isLegacyMidnightDue(d)) {
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return endOfIstanbulDay(day);
  }
  return d;
}

/** Görevin bitiş GÜNÜ (İstanbul). Eski kayıtlarda UTC takvim günü korunur. */
export function dueDayOf(dueAt: Date | string | null | undefined): string | null {
  const eff = effectiveDue(dueAt);
  return eff ? istanbulDayOf(eff) : null;
}

/** Bitiş geçti mi? (bitiş günü İstanbul'da tamamen bittiyse). */
export function isOverdue(dueAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  const eff = effectiveDue(dueAt);
  return !!eff && eff.getTime() < now.getTime();
}

/** `b - a` gün farkı (`YYYY-MM-DD`). */
export function teamDayDiff(a: string, b: string): number {
  const pa = DAY_RE.exec(a);
  const pb = DAY_RE.exec(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86_400_000);
}

/** `YYYY-MM-DD` + n gün. */
export function addTeamDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `YYYY-MM-DD` + n ay (ay sonu kırpılır: 31 Oca + 1 ay = 28/29 Şub). */
export function addTeamMonths(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + n;
  const target = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), last);
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(d)}`;
}

export type DueInfo = {
  /** İstanbul bitiş günü. */
  day: string;
  /** bitiş günü − bugün (gün). Negatif = gecikti. */
  daysLeft: number;
  overdue: boolean;
  /** "10 Eki" */
  short: string;
  /** "10 Eki · bugün", "2 gün gecikti" … */
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'danger';
};

const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** `YYYY-MM-DD` → "10 Eki" (hidrasyon-güvenli; Intl yok). */
export function shortDayLabel(day: string): string {
  const m = DAY_RE.exec(day);
  if (!m) return '';
  return `${Number(m[3])} ${TR_MONTHS_SHORT[Number(m[2]) - 1]}`;
}

/** Bitiş rozeti için tek hesap (liste, kanban, takvim ve AI aynı sonucu verir). */
export function dueInfo(dueAt: Date | string | null | undefined, done: boolean, now: Date = new Date()): DueInfo | null {
  const day = dueDayOf(dueAt);
  if (!day) return null;
  const today = istanbulDayOf(now);
  const daysLeft = teamDayDiff(today, day);
  const overdue = !done && isOverdue(dueAt, now);
  const short = shortDayLabel(day);
  if (done) return { day, daysLeft, overdue: false, short, label: short, tone: 'neutral' };
  if (overdue) {
    const late = Math.max(1, -daysLeft);
    return { day, daysLeft, overdue, short, label: `${short} · ${late} gün gecikti`, tone: 'danger' };
  }
  if (daysLeft === 0) return { day, daysLeft, overdue, short, label: `${short} · bugün`, tone: 'warning' };
  if (daysLeft === 1) return { day, daysLeft, overdue, short, label: `${short} · yarın`, tone: 'warning' };
  if (daysLeft <= 3) return { day, daysLeft, overdue, short, label: `${short} · ${daysLeft} gün kaldı`, tone: 'warning' };
  return { day, daysLeft, overdue, short, label: `${short} · ${daysLeft} gün kaldı`, tone: 'info' };
}

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TEAM_TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat('tr-TR', { timeZone: TEAM_TZ, day: 'numeric', month: 'long', year: 'numeric' });

/** "10 Eki 14:30" — İstanbul saatiyle (denetim D2: eski kod UTC saatini yerel gibi gösteriyordu). */
export function formatTeamDateTime(at: Date | string | null | undefined): string {
  if (!at) return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return dateTimeFormatter.format(d);
}

/** "10 Ekim 2026". */
export function formatTeamDate(at: Date | string | null | undefined): string {
  if (!at) return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return dateFormatter.format(d);
}

/** Göreli zaman ("şimdi", "5 dk önce", "3 sa önce", "2 gün önce"); 7 günden eskide tarih. */
export function relativeTeamTime(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return '';
  const d = at instanceof Date ? at : new Date(at);
  const diff = now.getTime() - d.getTime();
  if (Number.isNaN(diff)) return '';
  if (diff < 45_000) return 'şimdi';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} gün önce`;
  return formatTeamDate(d);
}

/** Dakika → "45 dk" / "2 sa 15 dk". */
export function formatMinutes(min: number | null | undefined): string {
  const v = Math.max(0, Math.round(min ?? 0));
  if (v < 60) return `${v} dk`;
  const h = Math.floor(v / 60);
  const r = v % 60;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}
