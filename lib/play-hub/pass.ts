/**
 * Oyun Pasosu — sezonluk XP yolu (yol haritası §7.3 meta katmanı), MEVCUT verilerle.
 *
 * Sezon = İstanbul takvim ayı (sezonluk lig F4.4'te gelene dek). Paso XP'si = bu ay
 * oyunlardan kazanılan XP'nin defterdeki toplamı (`PointsLedger.xpDelta`, kaynak:
 * `game` · `game_streak` · `game_quest`, yalnız `posted`). Ayrı tablo yok; değer her zaman
 * defterden türetilir (puan değişmezleriyle uyumlu, istemciden okunmaz).
 *
 * Kademeler ilerleme statüsüdür; kademe başına ödül YOK (kozmetik ödül kataloğu ve sezon
 * şeması F4.4'te). Arayüz ödül vaat etmez.
 */
import { istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';

/** Paso XP'sine sayılan defter kaynakları. */
export const PASS_XP_SOURCES = ['game', 'game_streak', 'game_quest'] as const;

export interface PassTier {
  /** 1..N */
  level: number;
  /** Bu kademeye ulaşmak için gereken toplam sezon XP'si. */
  xp: number;
  name: string;
  nameEn: string;
}

/**
 * Eşikler: 1 galibiyet ≈ 60–85 XP, seri +10/+40, günlük görevler +90. Gündelik oyuncu
 * (ayda ~20 galibiyet) 6.–7. kademeye, her gün oynayan 10. kademeye ulaşır.
 */
export const PASS_TIERS: readonly PassTier[] = [
  { level: 1, xp: 100, name: 'Isınma', nameEn: 'Warm-up' },
  { level: 2, xp: 300, name: 'Oyuncu', nameEn: 'Player' },
  { level: 3, xp: 600, name: 'Azimli', nameEn: 'Determined' },
  { level: 4, xp: 1000, name: 'Usta', nameEn: 'Skilled' },
  { level: 5, xp: 1500, name: 'Uzman', nameEn: 'Expert' },
  { level: 6, xp: 2200, name: 'Şampiyon', nameEn: 'Champion' },
  { level: 7, xp: 3000, name: 'Elit', nameEn: 'Elite' },
  { level: 8, xp: 4000, name: 'Yıldız', nameEn: 'Star' },
  { level: 9, xp: 5200, name: 'Efsane', nameEn: 'Legend' },
  { level: 10, xp: 6500, name: 'Ölümsüz', nameEn: 'Immortal' },
] as const;

export interface PassProgress {
  xp: number;
  /** Ulaşılan kademe (0 = henüz yok). */
  tier: number;
  next: PassTier | null;
  /** Sonraki kademeye kalan XP. */
  toNext: number;
  /** Mevcut kademe ile sonraki arasındaki ilerleme (0–100). */
  pctToNext: number;
  /** Tüm yol üzerindeki ilerleme (0–100). */
  pctTotal: number;
}

export function passProgress(xpRaw: number): PassProgress {
  const xp = Math.max(0, Math.floor(Number.isFinite(xpRaw) ? xpRaw : 0));
  let tier = 0;
  for (const t of PASS_TIERS) if (xp >= t.xp) tier = t.level;
  const next = PASS_TIERS.find((t) => t.level === tier + 1) ?? null;
  const prevXp = tier > 0 ? PASS_TIERS[tier - 1].xp : 0;
  const top = PASS_TIERS[PASS_TIERS.length - 1].xp;
  const toNext = next ? next.xp - xp : 0;
  const pctToNext = next ? Math.round(((xp - prevXp) / (next.xp - prevXp)) * 100) : 100;
  return {
    xp,
    tier,
    next,
    toNext,
    pctToNext: Math.max(0, Math.min(100, pctToNext)),
    pctTotal: Math.max(0, Math.min(100, Math.round((xp / top) * 100))),
  };
}

export interface PassSeason {
  /** "2026-10" */
  key: string;
  start: Date;
  end: Date;
}

/** İçinde bulunulan İstanbul takvim ayı. */
export function currentPassSeason(now: Date = new Date()): PassSeason {
  const day = istanbulDay(now); // YYYY-MM-DD (İstanbul)
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)); // 1..12
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return {
    key,
    start: istanbulDayStart(`${key}-01`),
    end: istanbulDayStart(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`),
  };
}

/** "Ekim 2026" — sezon adı (İstanbul). */
export function seasonLabel(season: PassSeason, locale: 'tr' | 'en' = 'tr'): string {
  // Ayın ortası: saat dilimi kaymasından bağımsız doğru ay adı.
  const mid = new Date(season.start.getTime() + 14 * 86_400_000);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(mid);
}
