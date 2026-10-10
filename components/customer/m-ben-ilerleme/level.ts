/**
 * Seviye eğrisi — saf (Prisma/DOM yok, jest ile test edilir).
 *
 * TEK KAYNAK: seviyeyi YAZAN akış `creditPointsAndXp` → `calculateLevel` (`lib/utils.ts`,
 * taban 1000 XP, çarpan 1,5 — geometrik). Eski ekranlar ilerlemeyi "her seviye 1000 XP"
 * varsayımıyla hesaplıyordu (progress-hub bulgu 1, trends bulgu 2): Seviye 2'nin ortasından
 * itibaren çubuk yanlış, Seviye 4+'te hep %100 ve "1.750 / 1.000" gibi imkânsız metinler.
 *
 * Burada seviye sınırları aynı formülden türetilir ve `calculateLevel` ile sınır
 * değerlerde birebir tutarlılığı test edilir (`__tests__/customer/m-ben-ilerleme/level.test.ts`).
 */
import { calculateLevel } from '@/lib/utils';

export const LEVEL_BASE_XP = 1000;
export const LEVEL_MULTIPLIER = 1.5;
/** Döngü emniyeti: 200. seviyenin eşiği zaten ~10^38 XP. */
const MAX_LEVEL = 200;

/** `level → level+1` için gereken XP (calculateLevel ile aynı yuvarlama). */
export function levelSpan(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.floor(LEVEL_BASE_XP * Math.pow(LEVEL_MULTIPLIER, l - 1));
}

/** Seviyenin başladığı ve bittiği kümülatif XP (`[start, end)`). */
export function levelBounds(level: number): { start: number; end: number } {
  const target = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  let start = 0;
  for (let l = 1; l < target; l++) start += levelSpan(l);
  return { start, end: start + levelSpan(target) };
}

/** XP'den seviye (yazan akışla aynı fonksiyon). */
export function levelFromXp(xp: number): number {
  return calculateLevel(Math.max(0, Math.floor(Number(xp) || 0)), LEVEL_BASE_XP, LEVEL_MULTIPLIER);
}

export type LevelProgress = {
  /** Gösterilen seviye: DB seviyesi ile XP'den çıkan seviyenin büyüğü. */
  level: number;
  xp: number;
  /** Seviyenin başladığı kümülatif XP. */
  levelStartXp: number;
  /** Bir sonraki seviyenin başladığı kümülatif XP. */
  nextLevelXp: number;
  /** Bu seviyede toplanan XP (0…xpForLevel). */
  xpIntoLevel: number;
  /** Bu seviyenin genişliği. */
  xpForLevel: number;
  /** Sonraki seviyeye kalan XP. */
  xpToNext: number;
  /** 0–100, tamsayı. */
  percent: number;
};

/**
 * İlerleme. `dbLevel` verilirse gösterilen seviye `max(dbLevel, levelFromXp(xp))` olur:
 *  - Admin seviyeyi elle yükselttiyse (eski `set_level` doğrusal XP yazıyordu) XP seviyenin
 *    başlangıcının altında kalabilir → ilerleme 0'dan başlar, "kalan XP" gerçek eşiğe göre.
 *  - XP bir yoldan seviye güncellenmeden arttıysa seviye XP'den türetilir (hiç %100'e kilitlenmez).
 */
export function levelProgress(xpInput: number, dbLevel?: number | null): LevelProgress {
  const xp = Math.max(0, Math.floor(Number(xpInput) || 0));
  const fromXp = levelFromXp(xp);
  const level = Math.min(MAX_LEVEL, Math.max(fromXp, Math.floor(Number(dbLevel) || 0), 1));
  const { start, end } = levelBounds(level);
  const span = end - start;
  const into = Math.min(span, Math.max(0, xp - start));
  const percent = span > 0 ? Math.min(100, Math.max(0, Math.floor((into / span) * 100))) : 0;
  return {
    level,
    xp,
    levelStartXp: start,
    nextLevelXp: end,
    xpIntoLevel: into,
    xpForLevel: span,
    xpToNext: Math.max(0, end - xp),
    percent,
  };
}

export type LevelMilestone = { level: number; atXp: number; remaining: number };

/** Sonraki `count` seviyenin eşikleri (yol haritası görünümü). */
export function upcomingLevels(progress: LevelProgress, count = 3): LevelMilestone[] {
  const out: LevelMilestone[] = [];
  for (let i = 1; i <= count && progress.level + i <= MAX_LEVEL; i++) {
    const lv = progress.level + i;
    const atXp = levelBounds(lv).start;
    out.push({ level: lv, atXp, remaining: Math.max(0, atXp - progress.xp) });
  }
  return out;
}

/**
 * "Bu tempoyla ~N gün" tahmini. Son `windowDays` günde defterde kazanılan XP'ye dayanır;
 * tempo yoksa (0) ya da tahmin 2 yılı aşıyorsa `null` (uydurma tahmin gösterilmez).
 */
export function daysToNextLevel(xpToNext: number, xpEarnedInWindow: number, windowDays: number): number | null {
  if (!(xpToNext > 0) || !(xpEarnedInWindow > 0) || !(windowDays > 0)) return null;
  const perDay = xpEarnedInWindow / windowDays;
  const days = Math.ceil(xpToNext / perDay);
  return days > 730 ? null : Math.max(1, days);
}
