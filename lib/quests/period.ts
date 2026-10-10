/**
 * Görev dönemleri — Europe/Istanbul takvimine göre (yol haritası §4.4/10).
 *
 * Şema `UserQuest` için tek satır tutar (`@@unique([userId, questId])`, `periodKey` alanı yok).
 * Dönem döngüsü bu yüzden satır çoğaltarak değil ZAMANLA çözülür:
 *  - İlerleme dönem penceresi içindeki kaynak kayıtlardan türetilir (lib/quests/mechanics.ts);
 *    gece yarısı geçince pencere değişir, ilerleme kendiliğinden sıfırlanır (cron gerekmez).
 *  - "Bu dönemde ödendi mi?" = `rewardedAt >= dönem başlangıcı`. Ödeme koşullu
 *    `updateMany({ OR: [{ rewardedAt: null }, { rewardedAt: { lt: start } }] })` ile tek sefer;
 *    defter anahtarı `quest:<userQuestId>:<dönemAnahtarı>` ikinci savunma hattıdır.
 *
 * Saf modül (Prisma/DOM yok) — jest ile test edilir.
 */

export const QUEST_TZ = 'Europe/Istanbul';

export type QuestPeriodKind = 'daily' | 'weekly' | 'monthly' | 'once';

export interface QuestPeriod {
  kind: QuestPeriodKind;
  /** Kararlı anahtar: `d:2026-10-10`, `w:2026-10-05` (Pazartesi), `m:2026-10`, `once`. */
  key: string;
  /** Dönem başlangıcı (dahil). `once` için Unix başlangıcı. */
  start: Date;
  /** Dönem sonu (hariç). `once` için null. */
  end: Date | null;
}

type Wall = { y: number; m: number; d: number; dow: number };

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let wallFormatter: Intl.DateTimeFormat | null = null;
let offsetFormatter: Intl.DateTimeFormat | null = null;

function wallParts(at: Date): Wall {
  if (!wallFormatter) {
    wallFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: QUEST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
  }
  const p: Record<string, string> = {};
  for (const part of wallFormatter.formatToParts(at)) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), dow: WEEKDAY[p.weekday] ?? 0 };
}

/** İstanbul'un verilen andaki UTC farkı (dakika). Sabit +03:00 varsayılmaz. */
function offsetMinutes(at: Date): number {
  if (!offsetFormatter) {
    offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: QUEST_TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  const p: Record<string, string> = {};
  for (const part of offsetFormatter.formatToParts(at)) p[part.type] = part.value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** İstanbul duvar saatinde (y, m, d) 00:00 anı. Taşan gün/ay (`d + 1`) Date.UTC ile normalleşir. */
export function istanbulMidnight(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d));
  const offset = offsetMinutes(new Date(guess.getTime() - 3 * 3_600_000));
  return new Date(guess.getTime() - offset * 60_000);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` — İstanbul takvim günü. (`toISOString().slice(0,10)` UTC'dir, kullanılmaz.) */
export function istanbulDayKey(at: Date): string {
  const w = wallParts(at);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

function dayKeyOfUtcMidnight(y: number, m: number, d: number): string {
  const n = new Date(Date.UTC(y, m - 1, d));
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
}

/** Görev türünü (`daily`/`DAILY`/`weekly`…) dönem türüne indirger. Bilinmeyen → `once`. */
export function questPeriodKind(type: unknown, opts: { autoReward?: boolean } = {}): QuestPeriodKind {
  // Otomatik ödenen görevler (ziyaret/başarım) sayaçlarını sıfırlamaz → tek seferlik.
  if (opts.autoReward) return 'once';
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t === 'daily' || t === 'weekly' || t === 'monthly') return t;
  return 'once';
}

export function getQuestPeriod(kind: QuestPeriodKind, now: Date = new Date()): QuestPeriod {
  const w = wallParts(now);
  switch (kind) {
    case 'daily':
      return {
        kind,
        key: `d:${dayKeyOfUtcMidnight(w.y, w.m, w.d)}`,
        start: istanbulMidnight(w.y, w.m, w.d),
        end: istanbulMidnight(w.y, w.m, w.d + 1),
      };
    case 'weekly': {
      const back = (w.dow + 6) % 7; // Pazartesi = 0
      return {
        kind,
        key: `w:${dayKeyOfUtcMidnight(w.y, w.m, w.d - back)}`,
        start: istanbulMidnight(w.y, w.m, w.d - back),
        end: istanbulMidnight(w.y, w.m, w.d - back + 7),
      };
    }
    case 'monthly':
      return {
        kind,
        key: `m:${w.y}-${pad(w.m)}`,
        start: istanbulMidnight(w.y, w.m, 1),
        end: istanbulMidnight(w.y, w.m + 1, 1),
      };
    case 'once':
    default:
      return { kind: 'once', key: 'once', start: new Date(0), end: null };
  }
}

/** Tamamlanıp süresi dolan tek seferlik görevin ödülü bu kadar süre daha alınabilir. */
export const QUEST_CLAIM_GRACE_MS = 24 * 3_600_000;

/**
 * İlerlemenin sayıldığı pencere `[from, to)`.
 *  - Dönemli görev: dönemin başlangıcından şimdiye.
 *  - Tek seferlik görev: görevin yayın anından (`createdAt`) bitişe ya da şimdiye.
 */
export function progressWindow(
  period: QuestPeriod,
  quest: { createdAt: Date; expiresAt: Date | null },
  now: Date
): { from: Date; to: Date } {
  // Görevin bitişinden sonraki etkinlik sayılmaz (dönemli görevde de).
  const to = quest.expiresAt && quest.expiresAt < now ? quest.expiresAt : now;
  if (period.kind !== 'once') return { from: period.start, to };
  return { from: quest.createdAt, to };
}

/** Bu dönemde ödendi mi? */
export function rewardedInPeriod(rewardedAt: Date | null | undefined, period: QuestPeriod): boolean {
  if (!rewardedAt) return false;
  if (period.kind === 'once') return true;
  return rewardedAt.getTime() >= period.start.getTime();
}

/**
 * Saklanan ilerleme (live olmayan) bu dönem için tamamlanmış mı?
 *  - Tek seferlik: `completedAt` ya da hedefe ulaşan ilerleme yeterli.
 *  - Dönemli: `progress`/`completedAt` dönem değişince SIFIRLANMAZ; bu yüzden yalnız bu dönemde
 *    ve son ödemeden SONRA tamamlanmış satır sayılır (aksi hâlde bir kez tamamlayan her dönem
 *    hiçbir şey yapmadan yeniden ödül alırdı).
 */
export function storedCompletionInPeriod(
  row: { progress: number; completedAt: Date | null; rewardedAt: Date | null } | null | undefined,
  period: QuestPeriod,
  target: number
): boolean {
  if (!row) return false;
  if (period.kind === 'once') return !!row.completedAt || row.progress >= target;
  if (!row.completedAt || row.completedAt.getTime() < period.start.getTime()) return false;
  return !row.rewardedAt || row.completedAt.getTime() > row.rewardedAt.getTime();
}

/**
 * Süresi dolmuş görevde ödül alma hâlâ mümkün mü? Ek süre (QUEST_CLAIM_GRACE_MS) yalnız
 * görevin BİTTİĞİ dönem içindir: dönemli bir görevde ek süre içinde başlayan yeni dönem
 * ödül hakkı doğurmaz. Süresi dolmamış görev için her zaman true.
 */
export function claimableAfterExpiry(
  expiresAt: Date | null | undefined,
  period: QuestPeriod,
  now: Date
): boolean {
  if (!expiresAt || now.getTime() <= expiresAt.getTime()) return true;
  if (now.getTime() > expiresAt.getTime() + QUEST_CLAIM_GRACE_MS) return false;
  return period.kind === 'once' || period.start.getTime() < expiresAt.getTime();
}
