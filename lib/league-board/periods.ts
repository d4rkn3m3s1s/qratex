/**
 * Lig sıralaması dönemleri — Europe/Istanbul takvimiyle (saf; DOM ve DB yok).
 *
 *  - `week`   : İstanbul Pazartesi 00:00 → bir sonraki Pazartesi 00:00 (yarı açık [start, end)).
 *  - `season` : 8 haftalık sezon (yol haritası F4.4). Sezonlar sabit bir Pazartesi çapasından
 *               (2026-01-05, İstanbul) art arda sayılır; numara çapadan itibaren 1'den başlar.
 *  - `all`    : pencere yok (tüm zamanlar).
 *
 * Saat dilimi farkı Intl ile ölçülür (sabit +03:00 varsayılmaz) — `components/ds/play/istanbul-time`
 * ile aynı yöntem; o modül istemci kitine ait olduğu için burada sunucu-güvenli kopyası tutulur.
 */

export const LEAGUE_PERIODS = ['week', 'season', 'all'] as const;
export type LeaguePeriod = (typeof LEAGUE_PERIODS)[number];

export const LEAGUE_CATEGORIES = ['points', 'feedbacks', 'badges', 'referrals'] as const;
export type LeagueCategory = (typeof LEAGUE_CATEGORIES)[number];

export const SEASON_LENGTH_WEEKS = 8;
/** Sezon çapası: İstanbul 2026-01-05 Pazartesi 00:00. */
export const SEASON_ANCHOR_DAY = '2026-01-05';

const TZ = 'Europe/Istanbul';
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type LeagueWindow = {
  period: LeaguePeriod;
  /** Önbellek ve istemci "son ziyaret" anahtarı (ör. `W2026-10-05`, `S5`, `ALL`). */
  key: string;
  /** Pencere başlangıcı (dahil). `all` için null. */
  start: Date | null;
  /** Pencere sonu (hariç). `all` için null. */
  end: Date | null;
  /** Yalnız `season`: 1'den başlayan sezon numarası. */
  seasonNumber?: number;
};

let fmt: Intl.DateTimeFormat | null = null;
function formatter(): Intl.DateTimeFormat {
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
  }
  return fmt;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function wallParts(at: Date) {
  const parts: Record<string, string> = {};
  for (const p of formatter().formatToParts(at)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour) % 24,
    mm: Number(parts.minute),
    ss: Number(parts.second),
    dow: WEEKDAY[parts.weekday] ?? 0,
  };
}

function offsetMinutes(at: Date): number {
  const w = wallParts(at);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  const atSec = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((asUtc - atSec) / 60_000);
}

/** İstanbul duvar saatinde (y, m, d) 00:00 anı. Ay/gün taşmaları Date.UTC ile normalize edilir. */
export function istanbulMidnightOf(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d));
  const offset = offsetMinutes(new Date(guess.getTime() - 3 * 3_600_000));
  return new Date(guess.getTime() - offset * 60_000);
}

/** İçinde bulunulan İstanbul haftasının Pazartesi 00:00 anı. */
export function istanbulWeekStart(now: Date = new Date()): Date {
  const w = wallParts(now);
  const back = (w.dow + 6) % 7; // Pazartesi → 0, Pazar → 6
  return istanbulMidnightOf(w.y, w.m, w.d - back);
}

/** İstanbul takviminde `YYYY-MM-DD`. */
export function istanbulDayKey(at: Date): string {
  const w = wallParts(at);
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

function anchorStart(): Date {
  const [y, m, d] = SEASON_ANCHOR_DAY.split('-').map(Number) as [number, number, number];
  return istanbulMidnightOf(y, m, d);
}

/** Haftanın başından `weeks` hafta sonrası (gece yarısı İstanbul'a göre yeniden hizalanır). */
function addWeeks(start: Date, weeks: number): Date {
  const w = wallParts(new Date(start.getTime() + 12 * 3_600_000)); // öğlen: gün sınırı kaymaz
  return istanbulMidnightOf(w.y, w.m, w.d + weeks * 7);
}

export function weekWindow(now: Date = new Date()): LeagueWindow {
  const start = istanbulWeekStart(now);
  return { period: 'week', key: `W${istanbulDayKey(start)}`, start, end: addWeeks(start, 1) };
}

/** Bir önceki (tamamlanmış) hafta. */
export function previousWeekWindow(now: Date = new Date()): LeagueWindow {
  const current = istanbulWeekStart(now);
  const start = addWeeks(current, -1);
  return { period: 'week', key: `W${istanbulDayKey(start)}`, start, end: current };
}

export function seasonWindow(now: Date = new Date()): LeagueWindow {
  const anchor = anchorStart();
  const weekStart = istanbulWeekStart(now);
  const weeksSince = Math.round((weekStart.getTime() - anchor.getTime()) / WEEK_MS);
  const index = Math.floor(weeksSince / SEASON_LENGTH_WEEKS);
  const start = addWeeks(anchor, index * SEASON_LENGTH_WEEKS);
  const end = addWeeks(start, SEASON_LENGTH_WEEKS);
  const seasonNumber = index + 1;
  return { period: 'season', key: `S${seasonNumber}`, start, end, seasonNumber };
}

export function allTimeWindow(): LeagueWindow {
  return { period: 'all', key: 'ALL', start: null, end: null };
}

export function resolveWindow(period: LeaguePeriod, now: Date = new Date()): LeagueWindow {
  if (period === 'week') return weekWindow(now);
  if (period === 'season') return seasonWindow(now);
  return allTimeWindow();
}

export function isLeaguePeriod(v: unknown): v is LeaguePeriod {
  return typeof v === 'string' && (LEAGUE_PERIODS as readonly string[]).includes(v);
}

export function isLeagueCategory(v: unknown): v is LeagueCategory {
  return typeof v === 'string' && (LEAGUE_CATEGORIES as readonly string[]).includes(v);
}
