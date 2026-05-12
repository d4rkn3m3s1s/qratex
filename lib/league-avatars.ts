import type { LeagueKey } from '@/lib/league-rules';

/**
 * Her lig için gösterilecek avatar görseli.
 * Liglere özel tasarımlar eklenirse public/images/league/ altına konulup buradan işaretlenebilir.
 */
export const LEAGUE_AVATARS: Record<LeagueKey, string> = {
  BASLANGIC: '/images/avatar/AVATAR ERKEK 1.svg',
  KOR: '/images/avatar/BAYİ AVATAR ERKEK 1.svg',
  VEYRA: '/images/avatar/AVATAR KADIN 1.svg',
  SAVASCI: '/images/avatar/AVATAR ERKEK 2.svg',
  ETERON: '/images/avatar/CAT.svg',
  VETRA: '/images/avatar/AVATAR KADIN 2.svg',
  ZENOR: '/images/avatar/EMOJİ1.svg',
};

export function getLeagueAvatarUrl(leagueKey: LeagueKey | string): string {
  return LEAGUE_AVATARS[leagueKey as LeagueKey] ?? LEAGUE_AVATARS.BASLANGIC;
}
