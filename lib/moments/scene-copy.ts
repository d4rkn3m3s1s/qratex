'use client';

/**
 * An Motoru sahne metinleri (TR/EN — mobil-erisilebilirlik-i18n B1). Puan kapsülü, seviye/lig/
 * rozet sahneleri ve ekran okuyucu duyuruları uygulama dilinde (eskiden yalnız Türkçe). Sayılar
 * arayüz dilinde biçimlenir.
 */
import { useLocaleSafe } from '@/lib/app-locale';
import { getFormatters } from '@/lib/i18n/format';
import type { SceneRarity } from '@/lib/moments/scene-colors';

function build(locale: 'tr' | 'en') {
  const n = (v: number) => getFormatters(locale).number(v);
  if (locale === 'en') {
    return {
      locale,
      n,
      pointsEarned: (points: number, xp: number) =>
        points <= 0 ? `+${n(xp)} XP earned` : xp > 0 ? `+${n(points)} points and +${n(xp)} XP earned` : `+${n(points)} points earned`,
      dismissHint: 'Tap or press Esc to continue',
      // Seviye
      levelOverline: 'Level up',
      levelTitle: 'You levelled up!',
      levelNow: (to: number) => `You are now level ${n(to)}.`,
      levelCardTitle: (to: number) => `Level ${n(to)}`,
      levelFromTo: (from: number, to: number) => `You went from level ${n(from)} to level ${n(to)}.`,
      levelProgress: (xpToNext: number | null) => (xpToNext != null ? `${n(xpToNext)} XP to the next level` : 'Progress to the next level'),
      levelAnnounce: (to: number, xpToNext: number | null) =>
        `You levelled up! You are now level ${n(to)}.` + (xpToNext != null ? ` ${n(xpToNext)} XP to the next level.` : ''),
      continue: 'Continue',
      // Lig
      leagueOverline: 'New league',
      leagueTitle: (toName: string | null) => (toName ? `You moved up to the ${toName} League!` : 'You moved up to a new league!'),
      leagueSuffix: 'League',
      leagueLeftBehind: (fromName: string) => `You left the ${fromName} league behind.`,
      leagueUp: 'You moved up a league.',
      leagueBalance: (points: number) => ` Your balance is ${n(points)} points.`,
      leagueAnnounce: (title: string, fromName: string | null) =>
        `Congratulations! ${title}` + (fromName ? ` You left the ${fromName} league behind.` : ''),
      great: 'Great!',
      // Rozet
      badgeFallbackName: 'New badge',
      badgeOverline: (hidden: boolean) => (hidden ? 'Hidden badge unlocked' : 'New badge'),
      badgeAnnounce: (overline: string, name: string, rarity: string) => `${overline}: ${name} (${rarity}). Added to your collection.`,
      badgeAdded: 'Added to your collection',
      ok: 'OK',
      rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as Record<SceneRarity, string>,
    };
  }
  return {
    locale,
    n,
    pointsEarned: (points: number, xp: number) =>
      points <= 0 ? `+${n(xp)} XP kazandın` : xp > 0 ? `+${n(points)} puan ve +${n(xp)} XP kazandın` : `+${n(points)} puan kazandın`,
    dismissHint: 'Geçmek için dokun ya da Esc tuşuna bas',
    levelOverline: 'Seviye atladın',
    levelTitle: 'Seviye atladın!',
    levelNow: (to: number) => `Artık ${n(to)}. seviyedesin.`,
    levelCardTitle: (to: number) => `${n(to)}. seviyedesin`,
    levelFromTo: (from: number, to: number) => `${n(from)}. seviyeden ${n(to)}. seviyeye yükseldin.`,
    levelProgress: (xpToNext: number | null) => (xpToNext != null ? `Sonraki seviyeye ${n(xpToNext)} XP` : 'Sonraki seviyeye ilerleme'),
    levelAnnounce: (to: number, xpToNext: number | null) =>
      `Seviye atladın! Artık ${n(to)}. seviyedesin.` + (xpToNext != null ? ` Sonraki seviyeye ${n(xpToNext)} XP kaldı.` : ''),
    continue: 'Devam et',
    leagueOverline: 'Yeni lig',
    leagueTitle: (toName: string | null) => (toName ? `${toName} Ligi'ne yükseldin!` : 'Yeni lige yükseldin!'),
    leagueSuffix: 'Ligi',
    leagueLeftBehind: (fromName: string) => `${fromName} ligini geride bıraktın.`,
    leagueUp: 'Bir üst lige çıktın.',
    leagueBalance: (points: number) => ` Bakiyen ${n(points)} puan.`,
    leagueAnnounce: (title: string, fromName: string | null) =>
      `Tebrikler! ${title}` + (fromName ? ` ${fromName} ligini geride bıraktın.` : ''),
    great: 'Harika!',
    badgeFallbackName: 'Yeni rozet',
    badgeOverline: (hidden: boolean) => (hidden ? 'Gizli rozet açıldı' : 'Yeni rozet'),
    badgeAnnounce: (overline: string, name: string, rarity: string) => `${overline}: ${name} (${rarity}). Koleksiyonuna eklendi.`,
    badgeAdded: 'Koleksiyonuna eklendi',
    ok: 'Tamam',
    rarity: { common: 'Yaygın', rare: 'Nadir', epic: 'Destansı', legendary: 'Efsanevi' } as Record<SceneRarity, string>,
  };
}

export type SceneCopy = ReturnType<typeof build>;

const CACHE: Partial<Record<'tr' | 'en', SceneCopy>> = {};

export function getSceneCopy(locale: 'tr' | 'en'): SceneCopy {
  return (CACHE[locale] ??= build(locale));
}

export function useSceneCopy(): SceneCopy {
  return getSceneCopy(useLocaleSafe() === 'en' ? 'en' : 'tr');
}
