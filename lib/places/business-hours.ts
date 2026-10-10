/**
 * Çalışma saatleri → "şu an açık mı?" — TEK kaynak (Keşfet kartları, mekân detayı, Kaydettiklerim).
 *
 * Eski keşif ucu açık/kapalıyı yalnız admin keşif ayarındaki saatlerden ve SUNUCU saat diliminden
 * (`getHours`, Vercel'de UTC) hesaplıyor, saat yoksa koşulsuz 09–23 "Açık" diyordu; bayinin kendi
 * girdiği `User.businessHours` ve `User.holidayMode` hiç okunmuyordu. Kurallar:
 *  - Öncelik: tatil modu > bayinin çalışma saatleri > (bilinmiyor → `null`, rozet GÖSTERİLMEZ).
 *  - Saat, gün ve gece taşması `Europe/Istanbul` duvar saatiyle (lib/happy-hour-live#getZonedClock).
 *  - `businessHours` serbest metindir (bayi ayarları: "Pzt-Cum 09:00-18:00, Cmt 10:00-14:00");
 *    şema yorumundaki JSON biçimi ({ "mon": { "open": "09:00", "close": "18:00" } }) de okunur.
 *    Ayrıştırılamayan metin `null` döner (uydurma "Açık" yok).
 * Saf modül (Jest ile test edilir); istemci de kullanabilir.
 */
import { getZonedClock } from '@/lib/happy-hour-live';
import { normalizeText } from './categories';

export const PLACES_TIME_ZONE = 'Europe/Istanbul';

/** Dakika cinsinden aralık; `close <= open` → gece yarısını aşar (kapanış ertesi gün). */
export interface TimeRange {
  open: number;
  close: number;
}

/** 7 elemanlı (0 = Pazar … 6 = Cumartesi); boş dizi = o gün kapalı. */
export type WeeklySchedule = TimeRange[][];

export interface OpenState {
  status: 'open' | 'closed' | 'holiday';
  /** Açıksa kapanış "SS:dd"; 24 saat açıksa `null`. */
  closesAt: string | null;
  /** Kapanışa ≤ 60 dk kaldı. */
  closingSoon: boolean;
  /** Kapalıysa bir sonraki açılış (0 = bugün, 1 = yarın …). */
  nextOpen: { inDays: number; weekday: number; time: string } | null;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_WORDS: ReadonlyArray<[string, number]> = [
  ['cumartesi', 6], ['pazartesi', 1], ['carsamba', 3], ['persembe', 4], ['wednesday', 3], ['thursday', 4],
  ['saturday', 6], ['tuesday', 2], ['monday', 1], ['friday', 5], ['sunday', 0], ['pazar', 0], ['cuma', 5],
  ['sali', 2], ['thurs', 4], ['tues', 2], ['thur', 4], ['pzt', 1], ['pts', 1], ['sal', 2], ['car', 3], ['crs', 3],
  ['per', 4], ['prs', 4], ['cum', 5], ['cmt', 6], ['cts', 6], ['paz', 0], ['pzr', 0], ['mon', 1], ['tue', 2],
  ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 0],
];
const DAY_BY_WORD = new Map(DAY_WORDS);
const GROUPS: ReadonlyArray<[string, number[]]> = [
  ['her gun', ALL_DAYS], ['hergun', ALL_DAYS], ['tum gunler', ALL_DAYS], ['every day', ALL_DAYS], ['everyday', ALL_DAYS],
  ['daily', ALL_DAYS], ['hafta ici', [1, 2, 3, 4, 5]], ['haftaici', [1, 2, 3, 4, 5]], ['weekdays', [1, 2, 3, 4, 5]],
  ['weekday', [1, 2, 3, 4, 5]], ['hafta sonu', [6, 0]], ['haftasonu', [6, 0]], ['weekends', [6, 0]], ['weekend', [6, 0]],
];
const GROUP_BY_WORD = new Map(GROUPS);

const TOKEN_RE = new RegExp(
  [
    // 1) saat aralığı: 09:00-18:00 · 9.30 - 23 · 10-22
    String.raw`(?<time>\b(\d{1,2})(?:[:.](\d{2}))?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?\b)`,
    // 2) sürekli açık
    String.raw`(?<always>7\s*/\s*24|24\s*/\s*7|24 saat|24 hours|non-stop)`,
    // 3) gün grupları
    `(?<group>${GROUPS.map(([w]) => w.replace(/ /g, '\\s+')).join('|')})`,
    // 4) kapalı
    String.raw`(?<closed>\bkapali\b|\bclosed\b|\btatil\b)`,
    // 5) gün adları (uzun önce)
    `(?<day>\\b(?:${DAY_WORDS.map(([w]) => w).join('|')})\\b)`,
    // 6) gün aralığı ayırıcısı
    String.raw`(?<dash>-)`,
  ].join('|'),
  'g',
);

function emptySchedule(): WeeklySchedule {
  return ALL_DAYS.map(() => []);
}

function toMinutes(h: string | undefined, m: string | undefined): number | null {
  const hour = Number(h);
  const minute = m === undefined ? 0 : Number(m);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute === 0) return 1440;
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
}

function normalizeRange(open: number, close: number): TimeRange {
  // "00:00-00:00" / "00:00-24:00" → 24 saat; aynı saat → 24 saat kabul.
  if (open === close || (open === 0 && close === 1440)) return { open: 0, close: 1440 };
  return { open: open % 1440, close: close === 1440 ? 1440 : close };
}

function dayRange(from: number, to: number): number[] {
  const out: number[] = [];
  let d = from;
  for (let i = 0; i < 7; i++) {
    out.push(d);
    if (d === to) break;
    d = (d + 1) % 7;
  }
  return out;
}

function parseJsonHours(raw: string): WeeklySchedule | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const schedule = emptySchedule();
  let any = false;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const k = normalizeText(key);
    const day = /^[0-6]$/.test(k) ? Number(k) : DAY_BY_WORD.get(k) ?? DAY_BY_WORD.get(k.slice(0, 3));
    if (day === undefined) continue;
    const ranges: Array<{ open?: unknown; close?: unknown }> = [];
    if (typeof value === 'string') {
      const parsed = parseBusinessHours(value);
      if (parsed) {
        schedule[day] = parsed.flat().length ? parsed.find((r) => r.length) ?? [] : [];
        any = any || schedule[day].length > 0;
      }
      continue;
    }
    if (Array.isArray(value)) ranges.push(...(value as Array<{ open?: unknown; close?: unknown }>));
    else if (value && typeof value === 'object') ranges.push(value as { open?: unknown; close?: unknown });
    for (const r of ranges) {
      if (!r || (r as { closed?: unknown }).closed === true) continue;
      const o = typeof r.open === 'string' ? /^(\d{1,2})[:.](\d{2})$/.exec(r.open.trim()) : null;
      const c = typeof r.close === 'string' ? /^(\d{1,2})[:.](\d{2})$/.exec(r.close.trim()) : null;
      const open = o ? toMinutes(o[1], o[2]) : null;
      const close = c ? toMinutes(c[1], c[2]) : null;
      if (open === null || close === null) continue;
      schedule[day].push(normalizeRange(open, close));
      any = true;
    }
  }
  return any ? schedule : null;
}

/**
 * Serbest metin ya da JSON çalışma saatini haftalık programa çevirir. Hiçbir saat aralığı
 * çıkarılamazsa `null` (bilinmiyor).
 */
export function parseBusinessHours(raw: string | null | undefined): WeeklySchedule | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) return parseJsonHours(trimmed);

  const text = normalizeText(trimmed).replace(/[–—~]/g, '-').replace(/\bto\b/g, '-');
  const schedule = emptySchedule();
  let pending = new Set<number>();
  let lastDays: number[] | null = null;
  let lastDayToken: number | null = null;
  let rangeFrom: number | null = null;
  let previousWasDay = false;
  let sawAnyDay = false;
  let anyRange = false;

  const applyRange = (range: TimeRange) => {
    const days = pending.size > 0 ? [...pending] : lastDays ?? (sawAnyDay ? [] : ALL_DAYS);
    for (const d of days) schedule[d].push(range);
    if (days.length > 0) anyRange = true;
    lastDays = days;
    pending = new Set();
  };

  for (const match of text.matchAll(TOKEN_RE)) {
    const g = match.groups ?? {};
    if (g.time) {
      const open = toMinutes(match[2], match[3]);
      const close = toMinutes(match[4], match[5]);
      previousWasDay = false;
      rangeFrom = null;
      if (open === null || close === null) continue;
      applyRange(normalizeRange(open, close));
    } else if (g.always) {
      previousWasDay = false;
      applyRange({ open: 0, close: 1440 });
    } else if (g.group) {
      const days = GROUP_BY_WORD.get(g.group.replace(/\s+/g, ' ')) ?? [];
      days.forEach((d) => pending.add(d));
      sawAnyDay = true;
      previousWasDay = false;
    } else if (g.closed) {
      const days = pending.size > 0 ? [...pending] : [];
      for (const d of days) schedule[d] = [];
      pending = new Set();
      previousWasDay = false;
    } else if (g.day) {
      const day = DAY_BY_WORD.get(g.day) as number;
      sawAnyDay = true;
      if (rangeFrom !== null) {
        dayRange(rangeFrom, day).forEach((d) => pending.add(d));
        rangeFrom = null;
      } else {
        pending.add(day);
      }
      lastDayToken = day;
      previousWasDay = true;
    } else if (g.dash) {
      if (previousWasDay && lastDayToken !== null) rangeFrom = lastDayToken;
      previousWasDay = false;
    }
  }

  if (!anyRange) return null;
  for (const day of schedule) day.sort((a, b) => a.open - b.open);
  return schedule;
}

export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Şu anki durum. `holidayMode` → "tatilde"; program bilinmiyorsa `null` (UI rozet göstermez).
 */
export function computeOpenState(
  schedule: WeeklySchedule | null,
  holidayMode: boolean,
  now: Date,
  timeZone: string = PLACES_TIME_ZONE,
): OpenState | null {
  if (holidayMode) return { status: 'holiday', closesAt: null, closingSoon: false, nextOpen: null };
  if (!schedule) return null;
  const { day, minutes } = getZonedClock(now, timeZone);

  // Bugünün aralıkları
  for (const r of schedule[day] ?? []) {
    if (r.open === 0 && r.close === 1440) {
      return { status: 'open', closesAt: null, closingSoon: false, nextOpen: null };
    }
    if (r.close > r.open && minutes >= r.open && minutes < r.close) {
      return { status: 'open', closesAt: formatMinutes(r.close), closingSoon: r.close - minutes <= 60, nextOpen: null };
    }
    if (r.close <= r.open && minutes >= r.open) {
      return { status: 'open', closesAt: formatMinutes(r.close), closingSoon: 1440 - minutes + r.close <= 60, nextOpen: null };
    }
  }
  // Dünden taşan gece aralıkları
  for (const r of schedule[(day + 6) % 7] ?? []) {
    if (r.close <= r.open && minutes < r.close) {
      return { status: 'open', closesAt: formatMinutes(r.close), closingSoon: r.close - minutes <= 60, nextOpen: null };
    }
  }
  // Bir sonraki açılış (en çok 7 gün)
  for (let offset = 0; offset <= 7; offset++) {
    const d = (day + offset) % 7;
    const candidates = (schedule[d] ?? []).filter((r) => offset > 0 || r.open > minutes);
    if (candidates.length > 0) {
      return {
        status: 'closed',
        closesAt: null,
        closingSoon: false,
        nextOpen: { inDays: offset, weekday: d, time: formatMinutes(candidates[0].open) },
      };
    }
  }
  return { status: 'closed', closesAt: null, closingSoon: false, nextOpen: null };
}

/** Kolaylık: ham alanlardan doğrudan durum. */
export function openStateFor(
  businessHours: string | null | undefined,
  holidayMode: boolean | null | undefined,
  now: Date,
): OpenState | null {
  return computeOpenState(parseBusinessHours(businessHours), holidayMode === true, now);
}
